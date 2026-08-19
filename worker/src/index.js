import { analyzeGaps, computeGapLifecycle } from './gapAnalyzer.js';
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

// Valida que un ticker exista realmente en TwelveData antes de darlo de alta.
// Solo bloquea ante una respuesta explícita de error (símbolo inexistente o no
// disponible en el plan) — si la validación misma falla por un problema de red,
// no se le echa la culpa al ticker: se deja pasar y el backfill posterior es
// quien determina si realmente hay datos.
// Distingue "el símbolo no existe / no está disponible en el plan" (400/404 —
// bloquea el alta) de un error transitorio nuestro como rate-limit o caída del
// servicio (429/5xx — no bloquea, es problema de timing, no del ticker).
function isDefinitelyInvalidSymbol(tickerData) {
    if (!tickerData || tickerData.status !== 'error') return false;
    return tickerData.code === 400 || tickerData.code === 404;
}

async function tickerExistsOnTwelveData(ticker, twelvedataKey) {
    try {
        const data = await fetchBatch([ticker], twelvedataKey, 1);
        return !isDefinitelyInvalidSymbol(data[ticker]);
    } catch (e) {
        console.error('Error validando ticker en TwelveData:', e);
        return true;
    }
}

const BATCH_SIZE = 8; // máx 8 symbols por request en plan gratuito

// Procesa UN SOLO batch (hasta 8 tickers) de un job y avanza su progreso.
// Deliberadamente no hace loop ni espera in-process entre batches: cada invocación
// hace un único request a TwelveData y retorna. El siguiente batch se procesa en la
// siguiente invocación (disparada por el cron cada 1 min), lo que respeta sobradamente
// el límite de 8 req/min y evita que el runtime corte una ejecución larga a mitad de camino
// (eso fue justamente lo que dejaba jobs grandes trabados en 'running' para siempre).
// Persiste el snapshot de gaps activos de un ticker para una fecha de análisis dada.
// Borra primero lo que hubiera para (ticker, analysisDate) y reinserta el set activo
// actual — incluso si quedó vacío. Antes se usaba INSERT OR REPLACE directo, que nunca
// borra: si un gap se cerraba más tarde en el mismo día (ej. TwelveData revisa el precio
// de "hoy" y el mínimo baja más), la fila vieja quedaba huérfana en gaps_history para
// siempre, mostrando un gap que ya no existía.
async function saveGapsSnapshot(env, ticker, analysisDate, gaps) {
    if (!env?.DB || !analysisDate) return;
    const stmts = [env.DB.prepare("DELETE FROM gaps_history WHERE ticker = ? AND analysis_date = ?").bind(ticker, analysisDate)];
    if (gaps.length > 0) {
        const insertStmt = env.DB.prepare("INSERT INTO gaps_history (ticker, type, gap_date, closest_point, farthest_point, dist_closest_pct, dist_farthest_pct, width_pct, current_close, analysis_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        stmts.push(...gaps.map(g =>
            insertStmt.bind(g.ticker, g.type, g.gap_date, g.closest_point, g.farthest_point, g.dist_closest_pct, g.dist_farthest_pct, g.width_pct, g.current_close, g.analysis_date)
        ));
    }
    try { await env.DB.batch(stmts); } catch (e) { console.error("Error guardando historial de gaps:", e); }
}

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
                INSERT INTO daily_prices (ticker, date, open_price, high_price, low_price, close_price, volume, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(ticker, date) DO UPDATE SET
                    open_price = excluded.open_price,
                    high_price = excluded.high_price,
                    low_price = excluded.low_price,
                    close_price = excluded.close_price,
                    volume = excluded.volume,
                    updated_at = CURRENT_TIMESTAMP
            `);
            const batchStmts = tickerData.values.map(day =>
                stmt.bind(ticker, day.datetime, parseFloat(day.open), parseFloat(day.high), parseFloat(day.low), parseFloat(day.close), parseInt(day.volume || 0))
            );
            try { await env.DB.batch(batchStmts); } catch (e) { console.error("Error insertando precios:", e); }
        }

        // 2. Analizar gaps
        const gaps = analyzeGaps(ticker, sortedData);
        allGaps.push(...gaps);

        // 3. Guardar snapshot de gaps del día para este ticker (borra + reinserta,
        // así el precio de "hoy" se puede actualizar varias veces por día sin dejar
        // gaps huérfanos si alguno se cierra entre una corrida y la siguiente).
        const analysisDate = sortedData[sortedData.length - 1]?.datetime;
        await saveGapsSnapshot(env, ticker, analysisDate, gaps);
    }

    const newCompleted = batchIndex + 1;
    await env.DB.prepare("UPDATE jobs SET completed_batches = ? WHERE id = ?").bind(newCompleted, job.id).run();

    return { done: newCompleted >= totalBatches, gaps: allGaps };
}

// Recalcula gaps leyendo solo lo ya guardado en D1 — nunca llama a TwelveData.
// De paso computa el ciclo de vida agregado (originados/cubiertos/restantes) sobre
// el mismo historial ya leído, y lo cachea en app_settings — así el KPI del
// Dashboard (GET /gaps/stats) queda siempre sincronizado con gaps_history (se
// computan en la misma pasada) y no tiene que releer+recalcular todo en cada
// visita a la página.
// Núcleo compartido: recalcula gaps + ciclo de vida de UN ticker, leyendo su
// historial completo de daily_prices. Usado tanto por recalculateGaps (todo
// en una pasada, para /analyze manual) como por processRecalcBatch (en lotes,
// para el recálculo automático tras cada daily_update).
async function recalcTicker(env, ticker) {
    const { results } = await env.DB.prepare(
        "SELECT date, open_price, high_price, low_price, close_price FROM daily_prices WHERE ticker = ? ORDER BY date ASC"
    ).bind(ticker).all();
    if (!results || results.length < 2) return null;

    const mapped = results.map(r => ({
        datetime: r.date,
        open: r.open_price,
        high: r.high_price,
        low: r.low_price,
        close: r.close_price,
    }));

    const gaps = analyzeGaps(ticker, mapped);
    const analysisDate = mapped[mapped.length - 1]?.date;
    await saveGapsSnapshot(env, ticker, analysisDate, gaps);

    const stats = computeGapLifecycle(ticker, mapped);
    return { gaps, stats };
}

function buildGapStatsCache(stats) {
    const remaining = stats.remainingTotal + stats.remainingPartial;
    const pct = (n) => (stats.originated > 0 ? parseFloat(((n / stats.originated) * 100).toFixed(1)) : 0);
    return {
        originated: stats.originated, closedFully: stats.closedFully, remaining,
        remainingTotal: stats.remainingTotal, remainingPartial: stats.remainingPartial,
        pctClosedFully: pct(stats.closedFully),
        pctRemaining: pct(remaining),
        pctRemainingTotal: pct(stats.remainingTotal),
        pctRemainingPartial: pct(stats.remainingPartial),
    };
}

// Recalcula gaps leyendo solo lo ya guardado en D1 — nunca llama a TwelveData.
// Todo en una sola pasada síncrona: lo usa /analyze (el usuario está mirando
// la página, espera el resultado). El recálculo automático post-daily_update
// usa processRecalcBatch en su lugar, justamente para NO hacer esto — con
// suficientes tickers activos, esta pasada puede no alcanzar a terminar
// dentro de los límites de una sola invocación del Worker.
async function recalculateGaps(env, tickerList) {
    let allGaps = [];
    let acc = { originated: 0, closedFully: 0, remainingTotal: 0, remainingPartial: 0 };

    for (const ticker of tickerList) {
        const result = await recalcTicker(env, ticker);
        if (!result) continue;
        allGaps.push(...result.gaps);
        acc.originated += result.stats.originated;
        acc.closedFully += result.stats.closedFully;
        acc.remainingTotal += result.stats.remainingTotal;
        acc.remainingPartial += result.stats.remainingPartial;
    }

    await env.DB.prepare(
        "INSERT INTO app_settings (key, value) VALUES ('gap_stats_cache', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(JSON.stringify(buildGapStatsCache(acc))).run();

    return allGaps;
}

const RECALC_BATCH_SIZE = 20; // más grande que BATCH_SIZE: acá no hay límite de TwelveData, solo costo de D1 + CPU por lote

// Recalcula gaps en lotes (1 lote por tick de cron), igual que processJobBatch
// pero sin llamadas externas. Acumula el ciclo de vida entre lotes en
// jobs.partial_stats y lo consolida en gap_stats_cache recién en el último.
async function processRecalcBatch(job, env) {
    const tickers = job.tickers.split(',').map(t => t.trim()).filter(Boolean);
    const totalBatches = Math.ceil(tickers.length / RECALC_BATCH_SIZE);

    if (job.total_batches !== totalBatches) {
        try { await env.DB.prepare("UPDATE jobs SET total_batches = ? WHERE id = ?").bind(totalBatches, job.id).run(); } catch (_) {}
    }

    const batchIndex = job.completed_batches;
    const chunk = tickers.slice(batchIndex * RECALC_BATCH_SIZE, batchIndex * RECALC_BATCH_SIZE + RECALC_BATCH_SIZE);
    if (chunk.length === 0) return { done: true };

    let acc = job.partial_stats
        ? JSON.parse(job.partial_stats)
        : { originated: 0, closedFully: 0, remainingTotal: 0, remainingPartial: 0 };

    for (const ticker of chunk) {
        const result = await recalcTicker(env, ticker);
        if (!result) continue;
        acc.originated += result.stats.originated;
        acc.closedFully += result.stats.closedFully;
        acc.remainingTotal += result.stats.remainingTotal;
        acc.remainingPartial += result.stats.remainingPartial;
    }

    const newCompleted = batchIndex + 1;
    const done = newCompleted >= totalBatches;

    await env.DB.prepare("UPDATE jobs SET completed_batches = ?, partial_stats = ? WHERE id = ?")
        .bind(newCompleted, JSON.stringify(acc), job.id).run();

    if (done) {
        await env.DB.prepare(
            "INSERT INTO app_settings (key, value) VALUES ('gap_stats_cache', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).bind(JSON.stringify(buildGapStatsCache(acc))).run();
    }

    return { done };
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

// Genera (o devuelve el ya existente) el resumen de IA de una jornada de mercado ya
// cerrada. Nunca llama a Gemini dos veces para la misma summary_date — así se evita
// gastar tokens de más y el botón manual siempre puede clickearse sin riesgo. Si ya
// existe, se devuelve tal cual (con su trigger_type original, sin pisarlo).
async function ensureDailySummary(env, targetDate, triggerType) {
    if (!targetDate) return { row: null, wasCached: false };

    const existing = await env.DB.prepare(
        "SELECT * FROM ai_summaries WHERE summary_date = ? ORDER BY generated_at DESC LIMIT 1"
    ).bind(targetDate).first();
    if (existing) return { row: existing, wasCached: true };

    if (!env.GEMINI_API_KEY) return { row: null, wasCached: false };

    // Solo tickers activos: uno desactivado puede conservar su última fila de
    // gaps_history (nunca se borra, es historial), pero no debe aparecer en el
    // resumen de un día en el que ya no se lo está siguiendo.
    const { results: gaps } = await env.DB.prepare(
        `SELECT gh.* FROM gaps_history gh
         JOIN tickers t ON t.ticker = gh.ticker
         WHERE gh.analysis_date = ? AND t.active = 1`
    ).bind(targetDate).all();
    if (!gaps.length) return { row: null, wasCached: false };

    const gapsCamel = gapsToCamel(gaps);
    const summary = await generateSummary(gapsCamel, env.GEMINI_API_KEY);
    if (!summary) return { row: null, wasCached: false };

    const insertResult = await env.DB.prepare(
        "INSERT INTO ai_summaries (summary, gaps_count, trigger_type, summary_date) VALUES (?, ?, ?, ?)"
    ).bind(summary, gaps.length, triggerType, targetDate).run();

    const row = await env.DB.prepare("SELECT * FROM ai_summaries WHERE id = ?").bind(insertResult.meta.last_row_id).first();
    return { row, wasCached: false };
}

// ----- Sistema de jobs (backfill / daily_update) -----

async function enqueueJob(env, { type, tickers, from_date, to_date, finalize_daily }) {
    const tickersStr = tickers.join(',');

    if (type === 'backfill') {
        // No duplicar un backfill ya encolado/corriendo para el mismo set de tickers
        const existing = await env.DB.prepare(
            "SELECT id FROM jobs WHERE type = 'backfill' AND tickers = ? AND status IN ('queued','running')"
        ).bind(tickersStr).first();
        if (existing) return existing.id;
    }

    const result = await env.DB.prepare(
        "INSERT INTO jobs (type, tickers, from_date, to_date, status, finalize_daily) VALUES (?, ?, ?, ?, 'queued', ?)"
    ).bind(type, tickersStr, from_date || null, to_date || null, finalize_daily ? 1 : 0).run();
    return result.meta.last_row_id;
}

async function getNextQueuedJob(env) {
    return await env.DB.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1").first();
}

// Reclama el próximo job en cola de forma atómica: el UPDATE solo tiene efecto
// si en ese mismo instante no hay ningún otro job 'running'. Si dos requests
// concurrentes (ej. dos altas de ticker casi simultáneas) llaman a esto a la
// vez, SQLite serializa los UPDATEs — solo uno de los dos puede ganar la
// carrera, el otro ve `changes=0` y no arranca nada. Esto reemplaza un patrón
// "leer si hay algo corriendo, después arrancar" que tenía una ventana real
// donde ambos requests podían pasar la lectura antes de que el otro escribiera
// su 'running' — pasó de verdad (dos backfills de 1 ticker arrancando en el
// mismo segundo, cada uno chocando con el otro contra TwelveData).
async function claimNextQueuedJob(env) {
    const next = await getNextQueuedJob(env);
    if (!next) return null;

    const result = await env.DB.prepare(
        `UPDATE jobs SET status = 'running', started_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'queued'
           AND NOT EXISTS (SELECT 1 FROM jobs WHERE status = 'running')`
    ).bind(next.id).run();

    if (result.meta.changes === 0) return null; // perdió la carrera

    return await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(next.id).first();
}

async function maybeStartNextJob(env, ctx) {
    const job = await claimNextQueuedJob(env);
    if (job) {
        ctx.waitUntil(runJob(job, env, ctx));
    }
}

// Avanza un job UN batch. Si el job tiene más batches pendientes, no los procesa acá:
// simplemente deja el job en 'running' con su progreso actualizado y retorna — el próximo
// tick de cron (cada 1 min) lo va a retomar exactamente donde quedó. Solo al llegar al
// último batch se ejecuta la finalización (marcar 'done'; para daily_update, encolar el
// recálculo de gaps en lotes; para recalc con finalize_daily, IA + notificaciones).
async function runJob(job, env, ctx) {
    if (job.status !== 'running') {
        await env.DB.prepare("UPDATE jobs SET status='running', started_at=CURRENT_TIMESTAMP WHERE id=?").bind(job.id).run();
    }

    let done = false;
    try {
        // El recálculo de gaps corre en su propio tipo de job, en lotes — con
        // suficientes tickers activos, hacerlo todo en una sola invocación (como
        // antes) puede no alcanzar a terminar dentro de los límites del Worker.
        // Pasó de verdad: se cortó a mitad de camino con 137 tickers activos.
        const result = job.type === 'recalc'
            ? await processRecalcBatch(job, env)
            : await processJobBatch(job, env);
        done = result.done;

        if (!done) return; // se retoma en el próximo tick de cron

        if (job.type === 'daily_update') {
            const activeTickers = await getActiveTickers(env);
            await enqueueJob(env, { type: 'recalc', tickers: activeTickers, to_date: job.to_date, finalize_daily: 1 });
        }

        await env.DB.prepare("UPDATE jobs SET status='done', completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(job.id).run();
        await logAudit(env.DB, `Job ${job.type} completado`, `Tickers: ${job.tickers}`);

        // El resumen de IA se maneja aparte, desacoplado del estado del job: si Gemini
        // tarda o falla, el job de recálculo ya quedó 'done' de forma segura, y el
        // cron reintenta el resumen solo (ver scheduled()) sin volver a tocar nada más.
        if (job.type === 'recalc' && job.finalize_daily) {
            // job.to_date es la fecha de calendario en que se encoló el daily_update
            // original, no necesariamente un día con rueda (fin de semana, feriado).
            // Si se usa esa fecha tal cual, last_completed_market_date apunta a un
            // día para el que gaps_history nunca va a tener datos — el resumen de IA
            // queda imposible de generar para siempre. Se usa la fecha real más
            // reciente encontrada en los precios recién actualizados.
            const latestPriceRow = await env.DB.prepare("SELECT MAX(date) as d FROM daily_prices").first();
            const actualMarketDate = latestPriceRow?.d || job.to_date;

            await env.DB.prepare(
                "INSERT INTO app_settings (key, value) VALUES ('last_completed_market_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
            ).bind(actualMarketDate).run();

            ctx.waitUntil((async () => {
                const { row: summaryRow } = await ensureDailySummary(env, actualMarketDate, 'auto');
                if (summaryRow) {
                    await sendEmail(summaryRow.summary, env);
                    await sendWhatsApp(summaryRow.summary, env);
                }
            })());
        }
    } catch (e) {
        console.error('Error ejecutando job:', e);
        try {
            await env.DB.prepare("UPDATE jobs SET status='error', error_message=?, completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(e.message || e), job.id).run();
        } catch (_) {}
        return;
    }

    // A propósito NO se encadena automáticamente al siguiente job en cola acá.
    // Si varios jobs de 1 batch se encadenaran sin pausa (ej. varias altas de
    // tickers casi simultáneas), dispararían llamadas a TwelveData pegadas una
    // detrás de otra sin respetar el límite de 8 req/min — esto ya pasó y dejó
    // tickers válidos sin datos. El cron (cada 1 min) es el único que arranca el
    // siguiente job en cola, dándole a cada job su propio minuto. El 'recalc' que
    // se acaba de encolar para daily_update también espera al próximo tick por la
    // misma razón (y de paso, no compite por CPU con lo que quede de este tick).
}

// Reactiva un ticker inactivo y encola un backfill de "catch-up" (solo lo que falta desde el último dato guardado).
async function reactivateTicker(env, ticker) {
    await env.DB.prepare("UPDATE tickers SET active = 1 WHERE ticker = ?").bind(ticker).run();

    // Re-encola el backfill completo (2025-01-01 -> hoy), no solo desde el
    // último dato guardado. Antes se calculaba el "hueco" mirando solo
    // MAX(date), asumiendo que si el dato más reciente era de hoy ya estaba
    // completo — pero eso es falso si el backfill inicial quedó truncado (ej.
    // por una colisión de rate-limit) y falta historia al PRINCIPIO, no al
    // final. El upsert de daily_prices hace que re-pedir días que ya están
    // guardados sea gratis en términos de corrección (se pisan con el mismo
    // valor), así que no hay costo real en no intentar ser "inteligente" acá.
    await enqueueJob(env, { type: 'backfill', tickers: [ticker], from_date: '2025-01-01', to_date: todayStr() });
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

        // ---- Resumen de IA: una sola generación por jornada cerrada, cacheada ----
        if (url.pathname === '/ai-summary' && request.method === 'POST') {
            try {
                if (!env.GEMINI_API_KEY) return json({ error: 'No hay clave de Gemini configurada' }, 400);

                // ?date=YYYY-MM-DD permite regenerar (o generar por primera vez) el
                // resumen de una jornada pasada puntual, siempre que ya exista un
                // snapshot de gaps para esa fecha — sin esto, solo se podía generar
                // el de la última jornada cerrada.
                const requestedDate = url.searchParams.get('date');
                let targetDate = requestedDate;
                if (!targetDate) {
                    const settingsRow = await env.DB.prepare(
                        "SELECT value FROM app_settings WHERE key = 'last_completed_market_date'"
                    ).first();
                    targetDate = settingsRow?.value;
                }
                if (!targetDate) {
                    return json({ error: 'Todavía no hay una jornada de mercado cerrada. Se genera automáticamente después del cierre.' }, 400);
                }

                const { row, wasCached } = await ensureDailySummary(env, targetDate, 'manual');
                if (!row) return json({ error: 'No se pudo generar el resumen. Puede ser un problema temporal de Gemini — probá de nuevo en un rato.' }, 500);

                return json({
                    summary: row.summary,
                    gapsCount: row.gaps_count,
                    summaryDate: row.summary_date,
                    triggerType: row.trigger_type,
                    generatedAt: row.generated_at,
                    wasCached,
                });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        if (url.pathname === '/ai-summary/latest' && request.method === 'GET') {
            try {
                // El "vigente" es el de la jornada de mercado más reciente
                // (summary_date), no el que se generó/regeneró más tarde en el
                // tiempo real (generated_at) — regenerar un resumen viejo no debe
                // hacer que ese pase a mostrarse como el actual.
                const latest = await env.DB.prepare("SELECT * FROM ai_summaries ORDER BY summary_date DESC LIMIT 1").first();
                return json({ summary: latest || null });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        if (url.pathname === '/ai-summary/history' && request.method === 'GET') {
            try {
                const { results } = await env.DB.prepare(
                    "SELECT * FROM ai_summaries ORDER BY summary_date DESC LIMIT 90"
                ).all();
                return json({ summaries: results });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        // ---- Tickers (fuente única de verdad) ----
        if (url.pathname === '/tickers' && request.method === 'GET') {
            try {
                const { results } = await env.DB.prepare(`
                    SELECT t.ticker, t.active, t.created_at, dp.last_updated
                    FROM tickers t
                    LEFT JOIN (
                        SELECT ticker, MAX(updated_at) as last_updated FROM daily_prices GROUP BY ticker
                    ) dp ON dp.ticker = t.ticker
                    ORDER BY t.ticker ASC
                `).all();
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
                    const isValid = await tickerExistsOnTwelveData(ticker, env.TWELVEDATA_API_KEY);
                    if (!isValid) {
                        return json({ error: `${ticker} no existe o no está disponible en TwelveData` }, 400);
                    }
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

        // ---- Alta masiva: valida en batches de hasta 8 tickers por llamada a
        // TwelveData (igual que fetchBatch para la ingesta) en vez de una
        // llamada por ticker — evita chocar contra el límite de 8 req/min
        // cuando se agregan muchos de una. Los válidos nuevos se encolan como
        // UN SOLO job de backfill combinado (el mismo patrón ya usado para la
        // ingesta diaria), en vez de un job separado por ticker.
        if (url.pathname === '/tickers/bulk' && request.method === 'POST') {
            try {
                const body = await request.json();
                const requested = Array.from(new Set(
                    (body.tickers || []).map(t => String(t).trim().toUpperCase()).filter(Boolean)
                ));
                if (requested.length === 0) return json({ error: 'Se requiere una lista de tickers' }, 400);

                const results = { created: [], reactivated: [], alreadyActive: [], invalid: [] };
                const toValidate = [];

                for (const ticker of requested) {
                    const existing = await env.DB.prepare("SELECT active FROM tickers WHERE ticker = ?").bind(ticker).first();
                    if (!existing) {
                        toValidate.push(ticker);
                    } else if (existing.active === 0) {
                        await reactivateTicker(env, ticker);
                        results.reactivated.push(ticker);
                    } else {
                        results.alreadyActive.push(ticker);
                    }
                }

                const validNew = [];
                for (let i = 0; i < toValidate.length; i += BATCH_SIZE) {
                    const chunk = toValidate.slice(i, i + BATCH_SIZE);
                    if (i > 0) await new Promise(r => setTimeout(r, 8000));

                    let data = {};
                    try {
                        data = await fetchBatch(chunk, env.TWELVEDATA_API_KEY, 1);
                    } catch (e) {
                        console.error('Error validando batch de tickers:', e);
                    }

                    for (const ticker of chunk) {
                        if (isDefinitelyInvalidSymbol(data[ticker])) {
                            results.invalid.push(ticker);
                        } else {
                            validNew.push(ticker);
                        }
                    }
                }

                if (validNew.length > 0) {
                    for (const ticker of validNew) {
                        await env.DB.prepare("INSERT OR IGNORE INTO tickers (ticker, active) VALUES (?, 1)").bind(ticker).run();
                    }
                    await enqueueJob(env, { type: 'backfill', tickers: validNew, from_date: '2025-01-01', to_date: todayStr() });
                    await logAudit(env.DB, 'Tickers agregados (bulk)', validNew.join(','));
                    results.created = validNew;
                }

                await maybeStartNextJob(env, ctx);
                return json(results);
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

                // Si se cambia la hora de actualización, hay que permitir que la
                // actualización de HOY pueda dispararse a la nueva hora — si no,
                // el guard "ya corrió hoy" (seteado por la corrida a la hora
                // vieja, o por una prueba manual anterior) bloquea silenciosamente
                // el resto del día, y el usuario nunca ve el resumen a la hora
                // que acaba de configurar.
                if (body.key === 'update_hour_utc') {
                    await env.DB.prepare("DELETE FROM app_settings WHERE key = 'last_daily_update_date'").run();
                }

                await logAudit(env.DB, 'Setting actualizado', `${body.key}=${body.value}`);
                return json({ key: body.key, value: body.value });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        if (url.pathname === '/history') {
            try {
                // LIMIT alto (no 0): es un piso de seguridad, no una paginación real.
                // Con ~75 tickers activos y snapshots diarios, un LIMIT bajo (antes 500)
                // se quedaba corto en un par de días y el frontend, que ordena por
                // analysis_date DESC, empezaba a perder días completos más viejos.
                const { results } = await env.DB.prepare("SELECT * FROM gaps_history ORDER BY analysis_date DESC LIMIT 5000").all();
                return new Response(JSON.stringify({ results }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
            }
        }

        // Conteo de gaps por fecha de análisis, agregado en SQL — a diferencia de /history
        // no se degrada nunca por un LIMIT: sirve para el gráfico de tendencia del Dashboard,
        // que necesita el total real por día, no solo lo que entra en una página de filas.
        if (url.pathname === '/history/summary') {
            try {
                const { results } = await env.DB.prepare(
                    `SELECT gh.analysis_date, COUNT(*) as count
                     FROM gaps_history gh
                     JOIN tickers t ON t.ticker = gh.ticker
                     WHERE t.active = 1
                     GROUP BY gh.analysis_date
                     ORDER BY gh.analysis_date DESC
                     LIMIT 30`
                ).all();
                return json({ results });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        // Ciclo de vida histórico de los gaps de todos los tickers activos: cuántos se
        // originaron alguna vez, cuántos terminaron completamente cubiertos por precio
        // posterior, y de los que siguen abiertos hoy. Se sirve desde el cache que
        // arma recalculateGaps() (mismo cómputo, misma pasada que gaps_history) — si
        // todavía no hay cache (primera vez), se calcula una vez y se guarda.
        if (url.pathname === '/gaps/stats') {
            try {
                const cached = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'gap_stats_cache'").first();
                if (cached?.value) {
                    return json(JSON.parse(cached.value));
                }

                const activeTickers = await getActiveTickers(env);
                await recalculateGaps(env, activeTickers);
                const fresh = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'gap_stats_cache'").first();
                return json(fresh?.value ? JSON.parse(fresh.value) : {
                    originated: 0, closedFully: 0, remaining: 0, remainingTotal: 0, remainingPartial: 0,
                    pctClosedFully: 0, pctRemaining: 0, pctRemainingTotal: 0, pctRemainingPartial: 0,
                });
            } catch (e) {
                return json({ error: e.message }, 500);
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

            const queuedJob = await claimNextQueuedJob(env);
            if (queuedJob) {
                await runJob(queuedJob, env, ctx);
                return;
            }

            // Prioridad 3: si la última jornada cerrada todavía no tiene resumen de IA
            // (Gemini falló o tardó demasiado la vez anterior), reintentar. Como
            // ensureDailySummary es idempotente, esto es seguro de reintentar hasta que
            // salga bien — pero NO en cada tick de cron (cada 1 min): el free tier de
            // Gemini permite 20 requests/día, y reintentar cada minuto agota esa cuota
            // en menos de media hora ante cualquier falla sostenida (pasó de verdad:
            // un 503 transitorio se encadenó con reintentos cada minuto durante horas
            // hasta agotar la cuota diaria, bloqueando el resumen por el resto del día).
            // Con este freno, en el peor caso (falla todo el día) hay ~16 intentos/día,
            // dejando margen de cuota para clicks manuales del usuario.
            // IMPORTANTE: nunca hay que cortar acá con `return` — si last_completed_market_date
            // quedó mal seteado (ej. un fin de semana, día sin datos: nunca va a existir un
            // gaps_history para esa fecha, entonces esto reintenta para siempre) esto
            // bloquearía la Prioridad 4 indefinidamente, y el sistema deja de actualizar
            // precios por completo — pasó de verdad (3 días frenado por esto).
            const AI_SUMMARY_RETRY_COOLDOWN_SEC = 90 * 60; // 90 minutos entre reintentos automáticos
            const lastCompletedRow = await env.DB.prepare(
                "SELECT value FROM app_settings WHERE key = 'last_completed_market_date'"
            ).first();
            if (lastCompletedRow?.value) {
                const hasSummary = await env.DB.prepare(
                    "SELECT id FROM ai_summaries WHERE summary_date = ?"
                ).bind(lastCompletedRow.value).first();
                if (!hasSummary) {
                    const lastAttemptRow = await env.DB.prepare(
                        "SELECT value FROM app_settings WHERE key = 'ai_summary_last_attempt'"
                    ).first();
                    const lastAttemptSec = lastAttemptRow?.value ? parseInt(lastAttemptRow.value, 10) : 0;
                    const nowSec = Math.floor(Date.now() / 1000);

                    if (nowSec - lastAttemptSec >= AI_SUMMARY_RETRY_COOLDOWN_SEC) {
                        await env.DB.prepare(
                            "INSERT INTO app_settings (key, value) VALUES ('ai_summary_last_attempt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
                        ).bind(String(nowSec)).run();

                        const { row: summaryRow } = await ensureDailySummary(env, lastCompletedRow.value, 'auto');
                        if (summaryRow) {
                            await sendEmail(summaryRow.summary, env);
                            await sendWhatsApp(summaryRow.summary, env);
                        }
                    }
                }
            }

            const settingsRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'update_hour_utc'").first();
            const updateHour = settingsRow?.value || '21:30';

            const now = new Date();
            const nowHHMM = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
            const today = todayStr();
            const dayOfWeek = now.getUTCDay(); // 0=domingo, 6=sábado — sin rueda, no tiene sentido correr

            const lastRunRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'last_daily_update_date'").first();
            const alreadyRanToday = lastRunRow?.value === today;

            if (!alreadyRanToday && dayOfWeek !== 0 && dayOfWeek !== 6 && isWithinWindow(nowHHMM, updateHour, 5)) {
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
