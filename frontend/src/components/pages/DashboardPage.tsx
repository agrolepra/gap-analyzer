import React, { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Sparkles } from 'lucide-react';
import { Button } from '../atoms/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import styles from './DashboardPage.module.css';

const WORKER = 'https://gap-analyzer-worker.agrolepra.workers.dev';
const NEAR_THRESHOLD = 7;

interface HistoryRow {
  ticker: string;
  type: 'Bullish' | 'Bearish';
  dist_closest_pct: number;
  analysis_date: string;
}

interface AiSummaryRow {
  summary: string;
  gaps_count: number;
  trigger_type: 'manual' | 'auto';
  generated_at: string;
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
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyRes, tickersRes, summaryRes] = await Promise.all([
        authFetch(`${WORKER}/history`),
        authFetch(`${WORKER}/tickers`),
        authFetch(`${WORKER}/ai-summary/latest`),
      ]);

      const historyData = await historyRes.json();
      if (!historyRes.ok) throw new Error(historyData.error || 'Error al cargar el historial de gaps');
      setHistory(historyData.results || []);

      const tickersData = await tickersRes.json();
      if (tickersRes.ok) {
        const active = (tickersData.tickers || []).filter((t: TickerRow) => t.active === 1);
        setActiveTickerCount(active.length);
      }

      const summaryData = await summaryRes.json();
      if (summaryRes.ok) setAiSummary(summaryData.summary || null);
    } catch (err: any) {
      setError(err.message || 'Error desconocido al cargar el dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const latestAnalysisDate = useMemo(() => {
    if (history.length === 0) return null;
    return history.reduce((max, r) => (r.analysis_date > max ? r.analysis_date : max), history[0].analysis_date);
  }, [history]);

  const currentGaps = useMemo(
    () => history.filter(r => r.analysis_date === latestAnalysisDate),
    [history, latestAnalysisDate]
  );

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
        trigger_type: 'manual',
        generated_at: new Date().toISOString(),
      });
      showToast('Resumen IA generado', 'success');
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
                {latestAnalysisDate ? new Date(latestAnalysisDate).toLocaleDateString() : 'Sin datos'}
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
              <Button variant="secondary" onClick={generateSummary} isLoading={generatingSummary}>
                Generar resumen IA
              </Button>
            </div>
            {aiSummary ? (
              <>
                <p className={styles.aiText}>{aiSummary.summary}</p>
                <p className={styles.aiMeta}>
                  {aiSummary.trigger_type === 'auto' ? 'Generado automáticamente' : 'Generado manualmente'} · {new Date(aiSummary.generated_at).toLocaleString()}
                </p>
              </>
            ) : (
              <p className={styles.aiText} style={{ color: 'var(--text-muted)' }}>
                Todavía no hay un resumen de IA generado.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
