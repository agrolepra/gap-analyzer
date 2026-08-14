import React, { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Sparkles, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../atoms/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getLatestGapsPerTicker, type HistoryRow } from '../../utils/latestGaps';
import { renderMiniMarkdown } from '../../utils/miniMarkdown';
import { formatDateDDMMYYYY, formatDateTimeBA } from '../../utils/formatDate';
import styles from './DashboardPage.module.css';

const WORKER = 'https://gap-analyzer-worker.agrolepra.workers.dev';
const NEAR_THRESHOLD = 7;

interface AiSummaryRow {
  summary: string;
  gaps_count: number;
  trigger_type: 'manual' | 'auto';
  summary_date: string | null;
  generated_at: string;
}

interface AiSummaryHistoryRow extends AiSummaryRow {
  id: number;
}

interface TickerRow {
  ticker: string;
  active: number;
}

const PIE_COLORS = ['#10b981', '#ef4444']; // Bullish, Bearish

export const DashboardPage: React.FC = () => {
  const { authFetch } = useAuth();
  const { showToast } = useToast();

  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [activeTickerCount, setActiveTickerCount] = useState<number>(0);
  const [aiSummary, setAiSummary] = useState<AiSummaryRow | null>(null);
  const [summaryHistory, setSummaryHistory] = useState<AiSummaryHistoryRow[]>([]);
  const [showSummaryHistory, setShowSummaryHistory] = useState(false);
  const [lastCompletedMarketDate, setLastCompletedMarketDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyRes, tickersRes, summaryRes, settingsRes, summaryHistoryRes] = await Promise.all([
        authFetch(`${WORKER}/history`),
        authFetch(`${WORKER}/tickers`),
        authFetch(`${WORKER}/ai-summary/latest`),
        authFetch(`${WORKER}/settings`),
        authFetch(`${WORKER}/ai-summary/history`),
      ]);

      const tickersData = await tickersRes.json();
      let activeSet = new Set<string>();
      if (tickersRes.ok) {
        const active = (tickersData.tickers || []).filter((t: TickerRow) => t.active === 1);
        activeSet = new Set(active.map((t: TickerRow) => t.ticker));
        setActiveTickerCount(active.length);
      }

      const historyData = await historyRes.json();
      if (!historyRes.ok) throw new Error(historyData.error || 'Error al cargar el historial de gaps');
      setHistory((historyData.results || []).filter((r: HistoryRow) => activeSet.has(r.ticker)));

      const summaryData = await summaryRes.json();
      if (summaryRes.ok) setAiSummary(summaryData.summary || null);

      const settingsData = await settingsRes.json();
      if (settingsRes.ok) setLastCompletedMarketDate(settingsData.settings?.last_completed_market_date || null);

      const summaryHistoryData = await summaryHistoryRes.json();
      if (summaryHistoryRes.ok) setSummaryHistory(summaryHistoryData.summaries || []);
    } catch (err: any) {
      setError(err.message || 'Error desconocido al cargar el dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const currentGaps = useMemo(() => getLatestGapsPerTicker(history), [history]);

  const nearGapsCount = useMemo(
    () => currentGaps.filter(r => r.dist_closest_pct <= NEAR_THRESHOLD).length,
    [currentGaps]
  );

  const typeBreakdown = useMemo(() => {
    const bullish = currentGaps.filter(r => r.type === 'Bullish').length;
    const bearish = currentGaps.filter(r => r.type === 'Bearish').length;
    return [
      { name: 'Bullish', value: bullish },
      { name: 'Bearish', value: bearish },
    ];
  }, [currentGaps]);

  const trendData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of history) {
      counts.set(r.analysis_date, (counts.get(r.analysis_date) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([date, count]) => ({ date: date.slice(5), gaps: count }));
  }, [history]);

  // Ya hay un resumen para el último cierre de mercado conocido: no hace falta (ni se debe)
  // generar otro hasta que cierre la próxima jornada. Si todavía no cerró ningún mercado
  // (deploy nuevo) tampoco hay nada para generar todavía.
  const needsGeneration = !!lastCompletedMarketDate && aiSummary?.summary_date !== lastCompletedMarketDate;

  const generateSummary = async () => {
    setGeneratingSummary(true);
    setError(null);
    try {
      const res = await authFetch(`${WORKER}/ai-summary`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar el resumen de IA');
      setAiSummary({
        summary: data.summary,
        gaps_count: data.gapsCount,
        trigger_type: data.triggerType,
        summary_date: data.summaryDate,
        generated_at: data.generatedAt,
      });
      showToast(data.wasCached ? 'Ya existía el resumen de hoy (no se gastan tokens de más)' : 'Resumen IA generado', data.wasCached ? 'info' : 'success');
    } catch (err: any) {
      setError(err.message || 'Error desconocido al generar el resumen.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className="text-gradient">Dashboard</h1>
        <p>Panorama general del mercado y los gaps detectados.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loadingState}>Cargando dashboard...</div>
      ) : (
        <>
          <div className={styles.kpiGrid}>
            <div className={`glass-panel ${styles.kpiCard}`}>
              <span className={styles.kpiLabel}>Tickers Activos</span>
              <span className={styles.kpiValue}>{activeTickerCount}</span>
            </div>
            <div className={`glass-panel ${styles.kpiCard}`}>
              <span className={styles.kpiLabel}>Gaps Detectados</span>
              <span className={styles.kpiValue}>{currentGaps.length}</span>
            </div>
            <div className={`glass-panel ${styles.kpiCard}`}>
              <span className={styles.kpiLabel}>Gaps ≤ {NEAR_THRESHOLD}%</span>
              <span className={styles.kpiValue} style={{ color: 'var(--success)' }}>{nearGapsCount}</span>
            </div>
            <div className={`glass-panel ${styles.kpiCard}`}>
              <span className={styles.kpiLabel}>Última Actualización</span>
              <span className={styles.kpiValueSmall}>
                {lastCompletedMarketDate ? formatDateDDMMYYYY(lastCompletedMarketDate) : 'Sin datos'}
              </span>
            </div>
          </div>

          {currentGaps.length > 0 ? (
            <div className={styles.chartsGrid}>
              <div className={`glass-panel ${styles.chartPanel}`}>
                <h3 className={styles.chartTitle}>Bullish vs Bearish</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={typeBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {typeBreakdown.map((entry, i) => (
                        <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className={`glass-panel ${styles.chartPanel}`}>
                <h3 className={styles.chartTitle}>Gaps por Fecha de Análisis</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trendData}>
                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                    <Bar dataKey="gaps" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className={styles.loadingState}>
              Todavía no hay gaps calculados. Agregá tickers en Configuración o visitá la página de Gaps.
            </div>
          )}

          <div className={`glass-panel ${styles.aiPanel}`}>
            <div className={styles.aiHeader}>
              <div className={styles.aiTitle}>
                <Sparkles size={18} color="#a5b4fc" />
                <h3>Resumen de IA</h3>
              </div>
              <Button
                variant="secondary"
                onClick={generateSummary}
                isLoading={generatingSummary}
                disabled={!needsGeneration}
                title={needsGeneration
                  ? 'Genera el resumen del último cierre de mercado'
                  : 'Ya está generado el resumen del último cierre. El próximo se genera solo después del cierre de hoy.'}
              >
                {needsGeneration ? 'Generar resumen IA' : (
                  <>
                    <CheckCircle2 size={16} style={{ marginRight: '6px', verticalAlign: '-3px' }} />
                    Resumen del día generado
                  </>
                )}
              </Button>
            </div>
            {aiSummary ? (
              <>
                {aiSummary.summary_date && (
                  <p className={styles.aiDateBadge}>
                    Cierre del {formatDateDDMMYYYY(aiSummary.summary_date)}
                  </p>
                )}
                <div className={styles.aiText}>{renderMiniMarkdown(aiSummary.summary, styles)}</div>
                <p className={styles.aiMeta}>
                  {aiSummary.trigger_type === 'auto' ? 'Generado automáticamente' : 'Generado manualmente'} · {formatDateTimeBA(aiSummary.generated_at)}
                </p>
              </>
            ) : (
              <p className={styles.aiText} style={{ color: 'var(--text-muted)' }}>
                Todavía no hay un resumen de IA generado. Se genera solo después del cierre de mercado.
              </p>
            )}
          </div>

          {(() => {
            const pastSummaries = summaryHistory.filter(s => s.summary_date !== aiSummary?.summary_date);
            if (pastSummaries.length === 0) return null;
            return (
              <div className={`glass-panel ${styles.aiPanel}`}>
                <button
                  type="button"
                  className={styles.historyToggle}
                  onClick={() => setShowSummaryHistory(v => !v)}
                >
                  {showSummaryHistory ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span>Historial de resúmenes ({pastSummaries.length})</span>
                </button>
                {showSummaryHistory && (
                  <div className={styles.historyList}>
                    {pastSummaries.map(s => (
                      <div key={s.id} className={styles.historyItem}>
                        {s.summary_date && (
                          <p className={styles.aiDateBadge}>Cierre del {formatDateDDMMYYYY(s.summary_date)}</p>
                        )}
                        <div className={styles.aiText}>{renderMiniMarkdown(s.summary, styles)}</div>
                        <p className={styles.aiMeta}>
                          {s.trigger_type === 'auto' ? 'Generado automáticamente' : 'Generado manualmente'} · {formatDateTimeBA(s.generated_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
};
