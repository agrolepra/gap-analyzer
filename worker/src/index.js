import { analyzeGaps } from './gapAnalyzer';
import { generateSummary } from './aiSummarizer';
import { sendEmail, sendWhatsApp } from './notifications';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function logAudit(db, action, details) {
    if(!db) return;
    try {
        await db.prepare("INSERT INTO audit_logs (action, details) VALUES (?, ?)").bind(action, details).run();
    } catch (e) {
        console.error("Error logging audit:", e);
    }
}

async function processTickers(tickers, twelvedataKey, env) {
    let allGaps = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (const ticker of tickers) {
        const twelvedataUrl = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=500&apikey=${twelvedataKey}`;
        
        try {
            const response = await fetch(twelvedataUrl);
            const data = await response.json();
            
            if (data.status === 'error') {
                console.error(`Error fetching ${ticker}:`, data.message);
                continue;
            }

            if (data.values && data.values.length > 0) {
                // Guardar precios históricos en D1 (Ignorando duplicados con ON CONFLICT IGNORE en sqlite pero acá hacemos try-catch por el UNIQUE)
                if (env && env.DB) {
                    const stmt = env.DB.prepare("INSERT OR IGNORE INTO daily_prices (ticker, date, open_price, high_price, low_price, close_price) VALUES (?, ?, ?, ?, ?, ?)");
                    const batchStmts = [];
                    // Insertamos al menos los últimos 5 días para tener histórico fresco
                    const toInsert = data.values.slice(0, 5); 
                    for (const day of toInsert) {
                        batchStmts.push(stmt.bind(ticker, day.datetime, day.open, day.high, day.low, day.close));
                    }
                    try {
                        await env.DB.batch(batchStmts);
                    } catch (e) {
                        console.error("Error insertando precios:", e);
                    }
                }

                const chronologicalData = data.values.reverse();
                const gaps = analyzeGaps(ticker, chronologicalData);
                allGaps = allGaps.concat(gaps);

                // Guardar los gaps del día en D1
                if (env && env.DB && gaps.length > 0) {
                    const stmtGap = env.DB.prepare("INSERT INTO gaps_history (ticker, type, gap_date, closest_point, farthest_point, dist_closest_pct, dist_farthest_pct, width_pct, current_close, analysis_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    const batchGaps = gaps.map(g => stmtGap.bind(g.ticker, g.type, g.date, g.closestPoint, g.farthestPoint, g.distClosestPct, g.distFarthestPct, g.widthPct, g.currentClose, todayStr));
                    try {
                        await env.DB.batch(batchGaps);
                    } catch (e) {
                        console.error("Error insertando gaps:", e);
                    }
                }
            }
        } catch (e) {
            console.error(`Error en red para ${ticker}`, e);
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

        if (request.method === 'POST' && url.pathname === '/api/analyze') {
            try {
                const body = await request.json();
                const tickers = body.tickers || [];
                const apiKey = body.apiKey;

                if (!apiKey || tickers.length === 0) {
                    return new Response(JSON.stringify({ error: 'Datos incompletos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                await logAudit(env.DB, 'ANALISIS_MANUAL', `Analizando ${tickers.length} tickers.`);
                const allGaps = await processTickers(tickers, apiKey, env);

                return new Response(JSON.stringify({ gaps: allGaps }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        }

        if (request.method === 'GET' && url.pathname === '/api/history') {
            try {
                if(!env.DB) return new Response(JSON.stringify({ error: 'Base de datos no vinculada' }), { status: 500, headers: corsHeaders });
                const { results } = await env.DB.prepare("SELECT * FROM gaps_history ORDER BY id DESC LIMIT 100").all();
                return new Response(JSON.stringify({ history: results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
            }
        }

        return new Response("GapAnalyzer Backend API is running", { headers: corsHeaders });
    },

    async scheduled(event, env, ctx) {
        console.log("Ejecutando análisis programado...");
        await logAudit(env.DB, 'CRON_AUTOMATICO', `Iniciando proceso cron.`);
        
        const tickersStr = env.TICKERS || 'AAPL,MSFT,TSLA,AMZN';
        const tickers = tickersStr.split(',').map(t => t.trim());
        
        const allGaps = await processTickers(tickers, env.TWELVEDATA_API_KEY, env);
        
        if (allGaps.length > 0) {
            const aiSummary = await generateSummary(allGaps, env.ANTHROPIC_API_KEY);
            await sendEmail(aiSummary, env);
            await sendWhatsApp(aiSummary, env);
        }
    }
};
