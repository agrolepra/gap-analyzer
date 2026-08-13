import { analyzeGaps } from './gapAnalyzer.js';
import { generateSummary } from './aiSummarizer.js';
import { sendEmail, sendWhatsApp } from './notifications.js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const WORKER_BASE = 'https://gap-analyzer-worker.agrolepra.workers.dev';

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

async function processTickers(tickers, twelvedataKey, env, outputsize = 30) {
    let allGaps = [];
    const BATCH_SIZE = 8; // máx 8 symbols por request en plan gratuito
    const DELAY_MS = 12000; // 12 seg entre batches para respetar 8 req/min

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const chunk = tickers.slice(i, i + BATCH_SIZE);
        
        // Esperar entre batches (excepto el primero)
        if (i > 0) await new Promise(r => setTimeout(r, DELAY_MS));
        
        let batchData;
        try {
            batchData = await fetchBatch(chunk, twelvedataKey, outputsize);
        } catch(e) {
            console.error('Error en batch fetch:', e);
            continue;
        }

        for (const ticker of chunk) {
            const tickerData = batchData[ticker];
            if (!tickerData || tickerData.status === 'error' || !tickerData.values?.length) {
                console.error(`Error o sin datos para ${ticker}:`, tickerData?.message || 'sin valores');
                continue;
            }

            const sortedData = [...tickerData.values].reverse(); // más antiguo → más reciente

            // 1. Guardar precios en BD con INSERT OR IGNORE (nunca duplica)
            if (env?.DB) {
                const stmt = env.DB.prepare("INSERT OR IGNORE INTO daily_prices (ticker, date, open_price, high_price, low_price, close_price, volume) VALUES (?, ?, ?, ?, ?, ?, ?)");
                const batchStmts = tickerData.values.map(day =>
                    stmt.bind(ticker, day.datetime, parseFloat(day.open), parseFloat(day.high), parseFloat(day.low), parseFloat(day.close), parseInt(day.volume || 0))
                );
                try { await env.DB.batch(batchStmts); } catch(e) { console.error("Error insertando precios:", e); }
            }

            // 2. Analizar gaps
            const gaps = analyzeGaps(ticker, sortedData);
            allGaps.push(...gaps);

            // 3. Guardar gaps en BD
            if (env?.DB && gaps.length > 0) {
                const stmt = env.DB.prepare("INSERT INTO gaps_history (ticker, type, gap_date, closest_point, farthest_point, dist_closest_pct, dist_farthest_pct, width_pct, current_close, analysis_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                const batchStmts = gaps.map(g =>
                    stmt.bind(g.ticker, g.type, g.gap_date, g.closest_point, g.farthest_point, g.dist_closest_pct, g.dist_farthest_pct, g.width_pct, g.current_close, g.analysis_date)
                );
                try { await env.DB.batch(batchStmts); } catch(e) { console.error("Error guardando historial de gaps:", e); }
            }
        }
    }

    return allGaps;
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

        if (url.pathname === '/analyze') {
            await logAudit(env.DB, 'Manual Analysis Triggered', `IP: ${request.headers.get('cf-connecting-ip')}`);

            let twelvedataKey = env.TWELVEDATA_API_KEY;
            let tickers;
            let aiKey = null;
            try {
                const body = await request.json();
                if (body.apiKey) twelvedataKey = body.apiKey;
                if (body.tickers?.length > 0) tickers = body.tickers;
                if (body.aiKey) aiKey = body.aiKey;
            } catch (_) {}

            if (!tickers) {
                const tickersStr = env.TICKERS || "AAPL,MSFT,TSLA";
                tickers = tickersStr.split(',').map(t => t.trim());
            }

            const gaps = await processTickers(tickers, twelvedataKey, env, 30);

            const gapsCamel = gaps.map(g => ({
                ticker: g.ticker,
                type: g.type,
                date: g.gap_date,
                closestPoint: g.closest_point,
                farthestPoint: g.farthest_point,
                distClosestPct: parseFloat(g.dist_closest_pct.toFixed(2)),
                distFarthestPct: parseFloat(g.dist_farthest_pct.toFixed(2)),
                widthPct: parseFloat(g.width_pct.toFixed(2)),
                currentClose: g.current_close,
                analysisDate: g.analysis_date,
            }));

            // Generar resumen con IA si hay key (OpenAI gpt-4o-mini)
            let aiSummary = null;
            const openAiKey = aiKey || env.OPENAI_API_KEY;
            if (openAiKey && gaps.length > 0) {
                aiSummary = await generateSummary(gapsCamel, openAiKey);
            }

            // En background: enviar email/WhatsApp si aplica
            ctx.waitUntil((async () => {
                if (gaps.length > 0 && aiSummary) {
                    await sendEmail(aiSummary, env);
                    await sendWhatsApp(aiSummary, env);
                }
            })());

            return new Response(JSON.stringify({ success: true, gaps: gapsCamel, aiSummary }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // ---- Backfill: carga hasta 1 año de historial sin duplicar ----
        if (url.pathname === '/backfill') {
            try {
                let twelvedataKey = env.TWELVEDATA_API_KEY;
                let tickers;
                try {
                    const body = await request.json();
                    if (body.apiKey) twelvedataKey = body.apiKey;
                    if (body.tickers?.length > 0) tickers = body.tickers;
                } catch (_) {}

                if (!tickers?.length) {
                    return new Response(JSON.stringify({ error: 'Se requiere lista de tickers' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                // outputsize 365 = ~1 año de datos diarios
                // Lanzamos en background para no bloquear la respuesta
                ctx.waitUntil((async () => {
                    await processTickers(tickers, twelvedataKey, env, 365);
                    await logAudit(env.DB, 'Backfill Completed', `Tickers: ${tickers.join(',')}`);
                })());

                return new Response(JSON.stringify({ 
                    message: `Backfill iniciado para ${tickers.length} ticker(s). Los datos se cargarán en segundo plano (puede tardar varios minutos respetando el límite de la API).`,
                    tickers 
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            } catch(e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
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

        return new Response("Gap Analyzer API. Endpoints: /auth, /analyze, /backfill, /history, /prices", { headers: corsHeaders });
    },

    async scheduled(event, env, ctx) {
        await logAudit(env.DB, 'Cron Analysis Triggered', `Cron: ${event.cron}`);
        const twelvedataKey = env.TWELVEDATA_API_KEY;
        const tickersStr = env.TICKERS || "AAPL,MSFT,TSLA";
        const tickers = tickersStr.split(',').map(t => t.trim());
        const gaps = await processTickers(tickers, twelvedataKey, env, 30);
        if (gaps.length > 0) {
            const summary = await generateSummary(gaps, env.ANTHROPIC_API_KEY);
            await sendEmail(summary, env);
            await sendWhatsApp(summary, env);
        }
    }
};
