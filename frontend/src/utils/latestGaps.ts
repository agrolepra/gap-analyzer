import type { GapData } from '../components/organisms/GapTable/GapTable';

export interface HistoryRow {
  id: number;
  ticker: string;
  type: 'Bullish' | 'Bearish';
  gap_date: string;
  closest_point: number;
  farthest_point: number;
  dist_closest_pct: number;
  dist_farthest_pct: number;
  width_pct: number;
  current_close: number;
  analysis_date: string;
}

// De todas las filas guardadas (que incluyen snapshots históricos por día), se queda
// solo con la última corrida de cada ticker — el estado "actual" de sus gaps.
export function getLatestGapsPerTicker(rows: HistoryRow[]): HistoryRow[] {
  const latestByTicker = new Map<string, string>();
  for (const row of rows) {
    const prev = latestByTicker.get(row.ticker);
    if (!prev || row.analysis_date > prev) latestByTicker.set(row.ticker, row.analysis_date);
  }
  return rows.filter(r => r.analysis_date === latestByTicker.get(r.ticker));
}

export function historyRowToGapData(r: HistoryRow): GapData {
  return {
    ticker: r.ticker,
    type: r.type,
    date: r.gap_date,
    currentClose: r.current_close,
    closestPoint: r.closest_point,
    farthestPoint: r.farthest_point,
    distClosestPct: r.dist_closest_pct,
    distFarthestPct: r.dist_farthest_pct,
    widthPct: r.width_pct,
  };
}
