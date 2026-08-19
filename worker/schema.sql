-- DROP TABLE IF EXISTS audit_logs;
-- DROP TABLE IF EXISTS gaps_history;
-- DROP TABLE IF EXISTS daily_prices;

CREATE TABLE IF NOT EXISTS daily_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    open_price REAL NOT NULL,
    high_price REAL NOT NULL,
    low_price REAL NOT NULL,
    close_price REAL NOT NULL,
    volume INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Sin DEFAULT CURRENT_TIMESTAMP: D1 no permite default no-constante en
    -- ALTER TABLE ADD COLUMN. Se setea explícitamente en cada INSERT/UPSERT.
    -- A diferencia de created_at (fecha de creación de la fila), esta se
    -- actualiza en cada upsert — refleja cuándo se trajo el precio por
    -- última vez, no cuándo se vio ese ticker por primera vez.
    updated_at TIMESTAMP,
    UNIQUE(ticker, date)
);

CREATE TABLE IF NOT EXISTS gaps_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    type TEXT NOT NULL,
    gap_date TEXT NOT NULL,
    closest_point REAL NOT NULL,
    farthest_point REAL NOT NULL,
    dist_closest_pct REAL NOT NULL,
    dist_farthest_pct REAL NOT NULL,
    width_pct REAL NOT NULL,
    current_close REAL NOT NULL,
    analysis_date TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickers (
    ticker TEXT PRIMARY KEY,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'backfill' | 'daily_update' | 'recalc'
    tickers TEXT NOT NULL,
    from_date TEXT,
    to_date TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    total_batches INTEGER DEFAULT 0,
    completed_batches INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    -- Solo para type='recalc': acumulador JSON del ciclo de vida de gaps
    -- entre lotes (se computa parcial en cada batch, se consolida al final).
    partial_stats TEXT,
    -- Solo para type='recalc': si es 1, al completar todos los lotes además
    -- fija last_completed_market_date y dispara el resumen de IA — así un
    -- recalc disparado por daily_update finaliza la jornada, pero uno
    -- disparado por /analyze (manual) no pisa esa fecha por las dudas.
    finalize_daily INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary TEXT NOT NULL,
    gaps_count INTEGER NOT NULL,
    trigger_type TEXT NOT NULL,
    summary_date TEXT,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Evita filas duplicadas cuando se recalculan gaps varias veces el mismo día.
-- Incluye closest_point porque un mismo gap_date puede producir dos tramos
-- discontinuos (cuando una rueda cubre el medio de un gap y lo divide en dos) —
-- sin closest_point en la clave, el segundo tramo pisaría al primero.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gaps_unique
    ON gaps_history(ticker, type, gap_date, analysis_date, closest_point);