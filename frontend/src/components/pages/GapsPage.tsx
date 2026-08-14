import React, { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import { Download } from 'lucide-react';
import { Button } from '../atoms/Button';
import { GapTable, type GapData } from '../organisms/GapTable/GapTable';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { styleHeaderRow, autoFitColumns, distColorArgb, downloadWorkbook, formatDateDDMMYYYY, SUCCESS_ARGB, DANGER_ARGB } from '../../utils/excelStyle';
import { getLatestGapsPerTicker, historyRowToGapData, type HistoryRow } from '../../utils/latestGaps';
import styles from './GapsPage.module.css';

const WORKER = 'https://gap-analyzer-worker.agrolepra.workers.dev';
const NEAR_THRESHOLD = 7;

type Tab = 'all' | 'near';

export const GapsPage: React.FC = () => {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [allGaps, setAllGaps] = useState<GapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const nearGaps = allGaps.filter(g => g.distClosestPct <= NEAR_THRESHOLD);

  // Carga instantánea: lee el último snapshot ya calculado (por el cron diario o un
  // recálculo manual previo) en vez de recomputar gaps en cada visita a la página.
  const loadLatest = async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyRes, tickersRes] = await Promise.all([
        authFetch(`${WORKER}/history`),
        authFetch(`${WORKER}/tickers`),
      ]);
      const data = await historyRes.json();
      if (!historyRes.ok) throw new Error(data.error || 'Error al cargar los gaps');

      const tickersData = await tickersRes.json();
      const activeSet = new Set(
        (tickersData.tickers || []).filter((t: { active: number }) => t.active === 1).map((t: { ticker: string }) => t.ticker)
      );

      const rows: HistoryRow[] = (data.results || []).filter((r: HistoryRow) => activeSet.has(r.ticker));
      const latest = getLatestGapsPerTicker(rows);
      setAllGaps(latest.map(historyRowToGapData));
      if (latest.length > 0) {
        setLastUpdated(latest.reduce((max, r) => (r.analysis_date > max ? r.analysis_date : max), latest[0].analysis_date));
      }
    } catch (err: any) {
      setError(err.message || 'Error desconocido al cargar los gaps.');
    } finally {
      setLoading(false);
    }
  };

  // Recalcula sobre los datos ya guardados en D1 (sin llamar a la API externa) y persiste
  // el resultado. Útil justo después de agregar/reactivar un ticker, sin esperar al
  // próximo ciclo automático — en el uso normal no hace falta, los datos ya se actualizan
  // solos después del cierre de mercado.
  const recalculate = async () => {
    setRecalculating(true);
    setError(null);
    try {
      const res = await authFetch(`${WORKER}/analyze`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al recalcular gaps');
      setAllGaps(data.gaps || []);
      setLastUpdated(new Date().toISOString());
      showToast('Gaps recalculados', 'success');
    } catch (err: any) {
      setError(err.message || 'Error desconocido al recalcular gaps.');
    } finally {
      setRecalculating(false);
    }
  };

  useEffect(() => { loadLatest(); }, []);

  const buildSheet = (workbook: ExcelJS.Workbook, name: string, data: GapData[]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = [
      { header: 'Ticker', key: 'ticker', width: 10 },
      { header: 'Tipo', key: 'type', width: 12 },
      { header: 'Fecha del Gap', key: 'date', width: 14 },
      { header: 'Cierre Actual', key: 'currentClose', width: 14 },
      { header: 'Punto más cercano', key: 'closestPoint', width: 16 },
      { header: 'Punto más lejano', key: 'farthestPoint', width: 16 },
      { header: '% Dist. Cercano', key: 'distClosestPct', width: 16 },
      { header: '% Dist. Lejano', key: 'distFarthestPct', width: 16 },
      { header: '% Ancho Gap', key: 'widthPct', width: 14 },
    ];

    data.forEach(g => {
      const row = sheet.addRow({
        ticker: g.ticker,
        type: g.type === 'Bullish' ? '▲ Bullish' : '▼ Bearish',
        date: formatDateDDMMYYYY(g.date),
        currentClose: g.currentClose,
        closestPoint: g.closestPoint,
        farthestPoint: g.farthestPoint,
        distClosestPct: g.distClosestPct,
        distFarthestPct: g.distFarthestPct,
        widthPct: g.widthPct,
      });

      const typeCell = row.getCell('type');
      typeCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      typeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: g.type === 'Bullish' ? SUCCESS_ARGB : DANGER_ARGB } };
      typeCell.alignment = { horizontal: 'center' };

      const distCell = row.getCell('distClosestPct');
      distCell.font = { color: { argb: distColorArgb(g.distClosestPct) }, bold: true };
    });

    styleHeaderRow(sheet);
    autoFitColumns(sheet);
  };

  const downloadExcel = async () => {
    if (allGaps.length === 0) return;
    setDownloading(true);
    setError(null);
    try {
      const workbook = new ExcelJS.Workbook();
      buildSheet(workbook, 'Resumen General', allGaps);
      buildSheet(workbook, `Distancia menor a ${NEAR_THRESHOLD}%`, nearGaps);
      await downloadWorkbook(workbook, `Reporte_Gaps_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Excel descargado', 'success');
    } catch (err: any) {
      setError('Error al descargar el Excel: ' + (err.message || 'Error desconocido'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className="text-gradient">Gaps</h1>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button
              variant="secondary"
              onClick={recalculate}
              isLoading={recalculating}
              title="Fuerza un recálculo inmediato sobre los datos ya guardados. No hace falta en el uso normal: se actualiza solo después de cada cierre de mercado."
            >
              Recalcular
            </Button>
            <Button variant="primary" onClick={downloadExcel} isLoading={downloading} disabled={allGaps.length === 0}>
              <Download size={16} style={{ marginRight: '8px' }} />
              Descargar Excel
            </Button>
          </div>
        </div>
        <p>Gaps de precio no cubiertos, calculados sobre los datos ya guardados (sin consultar la API externa).</p>
        {lastUpdated && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Último análisis: {formatDateDDMMYYYY(lastUpdated)}
          </p>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'all' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('all')}
        >
          Resumen General ({allGaps.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'near' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('near')}
        >
          Distancia ≤ {NEAR_THRESHOLD}% ({nearGaps.length})
        </button>
      </div>

      <div className={styles.resultsArea}>
        {loading && allGaps.length === 0 ? (
          <div className={styles.loadingState}>Calculando gaps...</div>
        ) : (
          <GapTable data={activeTab === 'all' ? allGaps : nearGaps} />
        )}
      </div>
    </div>
  );
};
