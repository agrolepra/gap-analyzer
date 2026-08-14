import { analyzeGaps } from './gapAnalyzer.js';
import { generateSummary } from './aiSummarizer.js';
import { sendEmail, sendWhatsApp } from './notifications.js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

async function logAudit(db, action, details) {
    if(!db) return;
    try {
        await db.prepare("INSERT INTO audit_logs (action, details) VALUES (?, ?)").bind(action, details).run();
    } catch (e) {
        console.error("Error logging audit:", e);
    }
}

// ----- Auth helpers -----
function unauthorized() {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function checkAuth(request, env) {
    if (!env.DB) return true; // Si no hay base de datos, no forzar (evitar romper desarrollo local sin D1)
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return false;

    try {
        const session = await env.DB.prepare("SELECT username FROM user_sessions WHERE token = ?").bind(token).first();
        return !!session;
    } catch (e) {
        console.error("Error validando sesión en BD:", e);
        return false;
    }
}

// ----- Twelve Data batch fetch -----
// Twelve Data permite hasta 8 symbols en un batch gratuito.
// La respuesta varía: objeto keyed por symbol si son múltiples, objeto directo si es uno.
async function fetchBatch(tickerChunk, twelvedataKey, outputsize = 30) {
    const symbols = tickerChunk.join(',');
    const url = `https://api.twelvedata.com/time_series?symbol=${symbols}&interval=1day&outputsize=${outputsize}&apikey=${twelvedataKey}`;
    const resp = await fetch(url);
    const data = await resp.json();

    // Si es 1 solo ticker la API devuelve directamente el objeto con values
    if (tickerChunk.length === 1) {
        return { [tickerChunk[0]]: data };
    }
    // Si son varios, devuelve { AAPL: {...}, MSFT: {...} }
    return data;
}

const BATCH_SIZE = 8; // máx 8 symbols por request en plan gratuito

// Procesa UN SOLO batch (hasta 8 tickers) de un job y avanza su progreso.
// Deliberadamente no hace loop ni espera in-process entre batches: cada invocación
// hace un único request a TwelveData y retorna. El siguiente batch se procesa en la
// siguiente invocación (disparada por el cron cada 1 min), lo que respeta sobradamente
// el límite de 8 req/min y evita que el runtime corte una ejecución larga a mitad de camino
// (eso fue justamente lo que dejaba jobs grandes trabados en 'running' para siempre).
async function processJobBatch(job, env) {
    const tickers = job.tickers.split(',').map(t => t.trim()).filter(Boolean);
    const totalBatches = Math.ceil(tickers.length / BATCH_SIZE);

    if (job.total_batches !== totalBatches) {
        try { await env.DB.prepare("UPDATE jobs SET total_batches = ? WHERE id = ?").bind(totalBatches, job.id).run(); } catch (_) {}
    }

    const batchIndex = job.completed_batches; // próximo batch a procesar (0-based)
    const chunk = tickers.slice(batchIndex * BATCH_SIZE, batchIndex * BATCH_SIZE + BATCH_SIZE);

    if (chunk.length === 0) {
        return { done: true, gaps: [] };
    }

    const twelvedataKey = env.TWELVEDATA_API_KEY;
    let outputsize;
    if (job.type === 'daily_update') {
        outputsize = 5; // colchón para no perder días si falló un tick de cron
    } else {
        const from = job.from_date ? new Date(job.from_date) : new Date('2025-01-01');
        const to = job.to_date ? new Date(job.to_date) : new Date();
        const days = Math.ceil((to - from) / 86400000) + 5;
        outputsize = Math.min(Math.max(days, 30), 5000);
    }

    let allGaps = [];
    let batchData = {};
    try {
        batchData = await fetchBatch(chunk, twelvedataKey, outputsize);
    } catch (e) {
        console.error('Error en batch fetch:', e);
    }

    for (const ticker of chunk) {
        const tickerData = batchData[ticker];
        if (!tickerData || tickerData.status === 'error' || !tickerData.values?.length) {
            console.error(`Error o sin datos para ${ticker}:`, tickerData?.message || 'sin valores');
            continue;
        }

        const sortedData = [...tickerData.values].reverse(); // más antiguo → más reciente

        // 1. Guardar precios en BD. Upsert (no IGNORE): si el ticker se agrega con el
        // mercado abierto, la fila del día se crea con el precio intradía — con IGNORE
        // esa fila quedaría fija para siempre y nunca reflejaría el cierre real. Con
        // ON CONFLICT DO UPDATE, la corrida del cierre (daily_update, después de la hora
        // configurada) pisa esa fila con los valores finales del día.
        if (env?.DB) {
            const stmt = env.DB.prepare(`
                INSERT INTO daily_prices (ticker, date, open_price, high_price, low_price, close_price, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(ticker, date) DO UPDATE SET
                    open_price = excluded.open_price,
                    high_price = excluded.high_price,
                    low_price = excluded.low_price,
                    close_price = excluded.close_price,
                    volume = excluded.volume
            `);
            const batchStmts = tickerData.values.map(day =>
                stmt.bind(ticker, day.datetime, parseFloat(day.open), parseFloat(day.high), parseFloat(day.low), parseFloat(day.close), parseInt(day.volume || 0))
            );
            try { await env.DB.batch(batchStmts); } catch (e) { console.error("Error insertando precios:", e); }
        }

        // 2. Analizar gaps
        const gaps = analyzeGaps(ticker, sortedData);
        allGaps.push(...gaps);

        // 3. Guardar gaps en BD (OR REPLACE: evita duplicados si se re-procesa el mismo rango)
        if (env?.DB && gaps.length > 0) {
            const stmt = env.DB.prepare("INSERT OR REPLACE INTO gaps_history (ticker, type, gap_date, closest_point, farthest_point, dist_closest_pct, dist_farthest_pct, width_pct, current_close, analysis_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            const batchStmts = gaps.map(g =>
                stmt.bind(g.ticker, g.type, g.gap_date, g.closest_point, g.farthest_point, g.dist_closest_pct, g.dist_farthest_pct, g.width_pct, g.current_close, g.analysis_date)
            );
            try { await env.DB.batch(batchStmts); } catch (e) { console.error("Error guardando historial de gaps:", e); }
        }
    }

    const newCompleted = batchIndex + 1;
    await env.DB.prepare("UPDATE jobs SET completed_batches = ? WHERE id = ?").bind(newCompleted, job.id).run();

    return { done: newCompleted >= totalBatches, gaps: allGaps };
}

// Recalcula gaps leyendo solo lo ya guardado en D1 — nunca llama a TwelveData.
async function recalculateGaps(env, tickerList) {
    let allGaps = [];
    for (const ticker of tickerList) {
        const { results } = await env.DB.prepare(
            "SELECT date, open_price, high_price, low_price, close_price FROM daily_prices WHERE ticker = ? ORDER BY date ASC"
        ).bind(ticker).all();
        if (!results || results.length < 2) continue;

        const mapped = results.map(r => ({
            datetime: r.date,
            open: r.open_price,
            high: r.high_price,
            low: r.low_price,
            close: r.close_price,
        }));

        const gaps = analyzeGaps(ticker, mapped);
        allGaps.push(...gaps);

        if (gaps.length > 0) {
            const stmt = env.DB.prepare("INSERT OR REPLACE INTO gaps_history (ticker, type, gap_date, closest_point, farthest_point, dist_closest_pct, dist_farthest_pct, width_pct, current_close, analysis_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            const batchStmts = gaps.map(g =>
                stmt.bind(g.ticker, g.type, g.gap_date, g.closest_point, g.farthest_point, g.dist_closest_pct, g.dist_farthest_pct, g.width_pct, g.current_close, g.analysis_date)
            );
            try { await env.DB.batch(batchStmts); } catch(e) { console.error("Error guardando historial de gaps:", e); }
        }
    }
    return allGaps;
}

function gapsToCamel(gaps) {
    return gaps.map(g => ({
        ticker: g.ticker,
        type: g.type,
        date: g.gap_date,
        closestPoint: g.closest_point,
        farthestPoint: g.farthest_point,
        distClosestPct: parseFloat(Number(g.dist_closest_pct).toFixed(2)),
        distFarthestPct: parseFloat(Number(g.dist_farthest_pct).toFixed(2)),
        widthPct: parseFloat(Number(g.width_pct).toFixed(2)),
        currentClose: g.current_close,
        analysisDate: g.analysis_date,
    }));
}

async function getActiveTickers(env) {
    const { results } = await env.DB.prepare("SELECT ticker FROM tickers WHERE active = 1 ORDER BY ticker ASC").all();
    return results.map(r => r.ticker);
}

// ----- Sistema de jobs (backfill / daily_update) -----

async function enqueueJob(env, { type, tickers, from_date, to_date }) {
    const tickersStr = tickers.join(',');

    if (type === 'backfill') {
        // No duplicar un backfill ya encolado/corriendo para el mismo set de tickers
        const existing = await env.DB.prepare(
            "SELECT id FROM jobs WHERE type = 'backfill' AND tickers = ? AND status IN ('queued','running')"
        ).bind(tickersStr).first();
        if (existing) return existing.id;
    }

    const result = await env.DB.prepare(
        "INSERT INTO jobs (type, tickers, from_date, to_date, status) VALUES (?, ?, ?, ?, 'queued')"
    ).bind(type, tickersStr, from_date || null, to_date || null).run();
    return result.meta.last_row_id;
}

async function hasRunningJob(env) {
    const row = await env.DB.prepare("SELECT id FROM jobs WHERE status = 'running' LIMIT 1").first();
    return !!row;
}

async function getNextQueuedJob(env) {
    return await env.DB.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1").first();
}

async function maybeStartNextJob(env, ctx) {
    if (await hasRunningJob(env)) return;
    const job = await getNextQueuedJob(env);
    if (job) {
        ctx.waitUntil(runJob(job, env, ctx));
    }
}

// Avanza un job UN batch. Si el job tiene más batches pendientes, no los procesa acá:
// simplemente deja el job en 'running' con su progreso actualizado y retorna — el próximo
// tick de cron (cada 1 min) lo va a retomar exactamente donde quedó. Solo al llegar al
// último batch se ejecuta la finalización (recálculo de gaps + IA + notificaciones para
// daily_update, marcar 'done', y arrancar el siguiente job en cola).
async function runJob(job, env, ctx) {
    if (job.status !== 'running') {
        await env.DB.prepare("UPDATE jobs SET status='running', started_at=CURRENT_TIMESTAMP WHERE id=?").bind(job.id).run();
    }

    let done = false;
    try {
        const result = await processJobBatch(job, env);
        done = result.done;

        if (!done) return; // se retoma en el próximo tick de cron

        if (job.type === 'daily_update') {
            const activeTickers = await getActiveTickers(env);
            const gaps = await recalculateGaps(env, activeTickers);
            const gapsCamel = gapsToCamel(gaps);

            let aiSummary = null;
            if (env.GEMINI_API_KEY && gaps.length > 0) {
                aiSummary = await generateSummary(gapsCamel, env.GEMINI_API_KEY);
                if (aiSummary) {
                    await env.DB.prepare(
                        "INSERT INTO ai_summaries (summary, gaps_count, trigger_type) VALUES (?, ?, 'auto')"
                    ).bind(aiSummary, gaps.length).run();
                }
            }

            if (gaps.length > 0 && aiSummary) {
                await sendEmail(aiSummary, env);
                await sendWhatsApp(aiSummary, env);
            }
        }

        await env.DB.prepare("UPDATE jobs SET status='done', completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(job.id).run();
        await logAudit(env.DB, `Job ${job.type} completado`, `Tickers: ${job.tickers}`);
    } catch (e) {
        console.error('Error ejecutando job:', e);
        try {
            await env.DB.prepare("UPDATE jobs SET status='error', error_message=?, completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(e.message || e), job.id).run();
        } catch (_) {}
        return;
    }

    // Job recién terminado: si hay otro en cola, arrancarlo (primer batch, inmediato)
    const next = await getNextQueuedJob(env);
    if (next) {
        ctx.waitUntil(runJob(next, env, ctx));
    }
}

// Reactiva un ticker inactivo y encola un backfill de "catch-up" (solo lo que falta desde el último dato guardado).
async function reactivateTicker(env, ticker) {
    await env.DB.prepare("UPDATE tickers SET active = 1 WHERE ticker = ?").bind(ticker).run();

    const lastRow = await env.DB.prepare("SELECT MAX(date) as last_date FROM daily_prices WHERE ticker = ?").bind(ticker).first();
    let fromDate = '2025-01-01';
    if (lastRow?.last_date) {
        const d = new Date(lastRow.last_date);
        d.setUTCDate(d.getUTCDate() + 1);
        fromDate = d.toISOString().split('T')[0];
    }
    const to = todayStr();
    if (fromDate <= to) {
        await enqueueJob(env, { type: 'backfill', tickers: [ticker], from_date: fromDate, to_date: to });
    }
    await logAudit(env.DB, 'Ticker reactivado', ticker);
}

function isWithinWindow(nowHHMM, targetHHMM, windowMinutes) {
    const toMinutes = (hhmm) => {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    };
    return Math.abs(toMinutes(nowHHMM) - toMinutes(targetHHMM)) <= windowMinutes;
}

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        // ---- Auth endpoint (público) ----
        if (url.pathname === '/auth') {
            try {
                const { username, password } = await request.json();
                const validUser = env.APP_USERNAME || 'admin';
                const validPass = env.APP_PASSWORD || 'changeme';
                if (username !== validUser || password !== validPass) {
                    return new Response(JSON.stringify({ error: 'Credenciales incorrectas' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                // Generar token UUID
                const token = crypto.randomUUID();
                // Guardar en la base de datos
                if (env.DB) {
                    await env.DB.prepare("INSERT INTO user_sessions (token, username) VALUES (?, ?)").bind(token, username).run();
                }

                return new Response(JSON.stringify({ token }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            } catch(e) {
                return new Response(JSON.stringify({ error: 'Error de autenticación: ' + e.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        }

        // ---- Verificar auth en el resto de endpoints ----
        const isAuth = await checkAuth(request, env);
        if (!isAuth) return unauthorized();

        // ---- Recalcular gaps (100% D1, nunca llama a TwelveData) ----
        if (url.pathname === '/analyze') {
            await logAudit(env.DB, 'Recalculo de Gaps', `IP: ${request.headers.get('cf-connecting-ip')}`);
            try {
                const activeTickers = await getActiveTickers(env);
                const gaps = await recalculateGaps(env, activeTickers);
                return json({ success: true, gaps: gapsToCamel(gaps) });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        // ---- Resumen de IA ----
        if (url.pathname === '/ai-summary' && request.method === 'POST') {
            try {
                let overrideKey = null;
                try { const body = await request.json(); if (body?.aiKey) overrideKey = body.aiKey; } catch (_) {}
                const geminiKey = overrideKey || env.GEMINI_API_KEY;
                if (!geminiKey) return json({ error: 'No hay clave de Gemini configurada' }, 400);

                const { results: recentGaps } = await env.DB.prepare(
                    "SELECT * FROM gaps_history WHERE analysis_date = (SELECT MAX(analysis_date) FROM gaps_history)"
                ).all();
                if (!recentGaps.length) {
                    return json({ error: 'No hay gaps para resumir. Recalculá primero.' }, 400);
                }

                const gapsCamel = gapsToCamel(recentGaps);
                const summary = await generateSummary(gapsCamel, geminiKey);
                if (!summary) return json({ error: 'No se pudo generar el resumen' }, 500);

                await env.DB.prepare(
                    "INSERT INTO ai_summaries (summary, gaps_count, trigger_type) VALUES (?, ?, 'manual')"
                ).bind(summary, gapsCamel.length).run();

                return json({ summary, gapsCount: gapsCamel.length });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        if (url.pathname === '/ai-summary/latest' && request.method === 'GET') {
            try {
                const latest = await env.DB.prepare("SELECT * FROM ai_summaries ORDER BY generated_at DESC LIMIT 1").first();
                return json({ summary: latest || null });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        // ---- Tickers (fuente única de verdad) ----
        if (url.pathname === '/tickers' && request.method === 'GET') {
            try {
                const { results } = await env.DB.prepare("SELECT ticker, active, created_at FROM tickers ORDER BY ticker ASC").all();
                return json({ tickers: results });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        if (url.pathname === '/tickers' && request.method === 'POST') {
            try {
                const body = await request.json();
                const ticker = (body.ticker || '').trim().toUpperCase();
                if (!ticker) return json({ error: 'Se requiere un ticker' }, 400);

                const existing = await env.DB.prepare("SELECT active FROM tickers WHERE ticker = ?").bind(ticker).first();

                let status;
                if (!existing) {
                    await env.DB.prepare("INSERT INTO tickers (ticker, active) VALUES (?, 1)").bind(ticker).run();
                    await enqueueJob(env, { type: 'backfill', tickers: [ticker], from_date: '2025-01-01', to_date: todayStr() });
                    await logAudit(env.DB, 'Ticker agregado', ticker);
                    status = 'created';
                } else if (existing.active === 0) {
                    await reactivateTicker(env, ticker);
                    status = 'reactivated';
                } else {
                    // ya existe y está activo: no-op, no se gasta cupo de API de más
                    status = 'already_active';
                }

                await maybeStartNextJob(env, ctx);
                return json({ ticker, status });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        const tickerPatchMatch = url.pathname.match(/^\/tickers\/([A-Za-z0-9.\-]+)$/);
        if (tickerPatchMatch && request.method === 'PATCH') {
            try {
                const ticker = tickerPatchMatch[1].toUpperCase();
                const body = await request.json();
                const wantActive = !!body.active;

                const current = await env.DB.prepare("SELECT active FROM tickers WHERE ticker = ?").bind(ticker).first();
                if (!current) return json({ error: 'Ticker no encontrado' }, 404);

                if (wantActive && current.active === 0) {
                    await reactivateTicker(env, ticker);
                } else if (!wantActive && current.active === 1) {
                    await env.DB.prepare("UPDATE tickers SET active = 0 WHERE ticker = ?").bind(ticker).run();
                    await logAudit(env.DB, 'Ticker desactivado', ticker);
                }

                await maybeStartNextJob(env, ctx);
                return json({ ticker, active: wantActive });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        // ---- Jobs (banner de progreso persistente) ----
        if (url.pathname === '/jobs/active' && request.method === 'GET') {
            try {
                const running = await env.DB.prepare("SELECT * FROM jobs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1").first();
                const { results: queued } = await env.DB.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC").all();
                const lastCompleted = await env.DB.prepare("SELECT * FROM jobs WHERE status IN ('done','error') ORDER BY completed_at DESC LIMIT 1").first();
                return json({ running: running || null, queued, lastCompleted: lastCompleted || null });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        // ---- Configuración (app_settings) ----
        if (url.pathname === '/settings' && request.method === 'GET') {
            try {
                const { results } = await env.DB.prepare("SELECT key, value FROM app_settings").all();
                const settings = {};
                for (const row of results) settings[row.key] = row.value;
                return json({ settings });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        if (url.pathname === '/settings' && request.method === 'POST') {
            try {
                const body = await request.json();
                if (!body.key) return json({ error: 'Se requiere key' }, 400);
                await env.DB.prepare(
                    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
                ).bind(body.key, String(body.value)).run();
                await logAudit(env.DB, 'Setting actualizado', `${body.key}=${body.value}`);
                return json({ key: body.key, value: body.value });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        if (url.pathname === '/history') {
            try {
                const { results } = await env.DB.prepare("SELECT * FROM gaps_history ORDER BY analysis_date DESC LIMIT 500").all();
                return new Response(JSON.stringify({ results }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
            }
        }

        if (url.pathname === '/prices') {
            try {
                const ticker = url.searchParams.get('ticker');
                if (!ticker) {
                    const { results } = await env.DB.prepare(
                        "SELECT DISTINCT ticker FROM daily_prices ORDER BY ticker ASC"
                    ).all();
                    return new Response(JSON.stringify({ tickers: results.map(r => r.ticker) }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                const { results } = await env.DB.prepare(
                    "SELECT ticker, date, open_price, high_price, low_price, close_price, volume FROM daily_prices WHERE ticker = ? ORDER BY date DESC LIMIT 500"
                ).bind(ticker.toUpperCase()).all();
                return new Response(JSON.stringify({ results }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
            }
        }

        return new Response("Gap Analyzer API. Endpoints: /auth, /analyze, /ai-summary, /tickers, /jobs/active, /settings, /history, /prices", { headers: corsHeaders });
    },

    async scheduled(event, env, ctx) {
        try {
            // Prioridad 1: si hay un job 'running' con batches pendientes (quedó a medio
            // camino en el tick anterior), retomarlo por exactamente un batch más.
            const runningJob = await env.DB.prepare("SELECT * FROM jobs WHERE status = 'running' LIMIT 1").first();
            if (runningJob) {
                await runJob(runningJob, env, ctx);
                return;
            }

            const queuedJob = await getNextQueuedJob(env);
            if (queuedJob) {
                await runJob(queuedJob, env, ctx);
                return;
            }

            const settingsRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'update_hour_utc'").first();
            const updateHour = settingsRow?.value || '21:30';

            const now = new Date();
            const nowHHMM = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
            const today = todayStr();

            const lastRunRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'last_daily_update_date'").first();
            const alreadyRanToday = lastRunRow?.value === today;

            if (!alreadyRanToday && isWithinWindow(nowHHMM, updateHour, 5)) {
                const activeTickers = await getActiveTickers(env);
                if (activeTickers.length > 0) {
                    const jobId = await enqueueJob(env, { type: 'daily_update', tickers: activeTickers, from_date: null, to_date: today });
                    await env.DB.prepare(
                        "INSERT INTO app_settings (key, value) VALUES ('last_daily_update_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
                    ).bind(today).run();
                    const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first();
                    if (job) await runJob(job, env, ctx);
                }
            }
        } catch (e) {
            console.error('Error en scheduled():', e);
        }
    }
};
