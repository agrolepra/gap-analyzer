import React, { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { Download } from 'lucide-react';
import { PricesTable, type PriceData } from '../organisms/PricesTable/PricesTable';
import { Button } from '../atoms/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { styleHeaderRow, autoFitColumns, downloadWorkbook, SUCCESS_ARGB, DANGER_ARGB } from '../../utils/excelStyle';
import styles from './PricesPage.module.css';

const WORKER = 'https://gap-analyzer-worker.agrolepra.workers.dev';

export const PricesPage: React.FC = () => {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [tickers, setTickers] = useState<string[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTickers = async () => {
    try {
      const res = await authFetch(`${WORKER}/tickers`);
      if (res.ok) {
        const data = await res.json();
        const active: string[] = (data.tickers || [])
          .filter((t: { active: number }) => t.active === 1)
          .map((t: { ticker: string }) => t.ticker);
        setTickers(active);
        setSelectedTicker(active[0] || '');
      }
    } catch (err) {
      console.error("Error loading tickers:", err);
    }
  };

  const loadPrices = async (ticker: string) => {
    if (!ticker) { setPrices([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${WORKER}/prices?ticker=${ticker}`);
      if (!res.ok) {
        throw new Error('Error al obtener las cotizaciones.');
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setPrices(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Error desconocido.');
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = async () => {
    if (tickers.length === 0) return;
    setDownloading(true);
    setError(null);
    try {
      const workbook = new ExcelJS.Workbook();

      for (const ticker of tickers) {
        const res = await authFetch(`${WORKER}/prices?ticker=${ticker}`);
        if (!res.ok) continue;

        const data = await res.json();
        const rows = data.results || [];
        if (rows.length === 0) continue;

        const sheet = workbook.addWorksheet(ticker);
        sheet.columns = [
          { header: 'Fecha', key: 'date', width: 12 },
          { header: 'Apertura', key: 'open', width: 12 },
          { header: 'Máximo', key: 'high', width: 12 },
          { header: 'Mínimo', key: 'low', width: 12 },
          { header: 'Cierre', key: 'close', width: 12 },
          { header: 'Volumen', key: 'volume', width: 14 },
          { header: 'Var. %', key: 'varPct', width: 10 },
        ];

        rows.forEach((row: any, idx: number) => {
          const prevClose = rows[idx + 1]?.close_price;
          const varPct = prevClose ? ((row.close_price - prevClose) / prevClose) * 100 : null;

          const excelRow = sheet.addRow({
            date: row.date,
            open: row.open_price,
            high: row.high_price,
            low: row.low_price,
            close: row.close_price,
            volume: row.volume,
            varPct: varPct != null ? parseFloat(varPct.toFixed(2)) : null,
          });

          if (varPct != null) {
            excelRow.getCell('varPct').font = { color: { argb: varPct >= 0 ? SUCCESS_ARGB : DANGER_ARGB }, bold: true };
          }
        });

        styleHeaderRow(sheet);
        autoFitColumns(sheet);
      }

      await downloadWorkbook(workbook, `cotizaciones_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Excel descargado', 'success');
    } catch (err: any) {
      setError('Error al descargar el Excel: ' + (err.message || 'Error desconocido'));
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    loadTickers();
  }, []);

  useEffect(() => {
    loadPrices(selectedTicker);
  }, [selectedTicker]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className="text-gradient">Cotizaciones Históricas</h1>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button
              variant="secondary"
              onClick={() => loadPrices(selectedTicker)}
              isLoading={loading}
            >
              Refrescar
            </Button>
            <Button
              variant="primary"
              onClick={downloadExcel}
              isLoading={downloading}
              disabled={tickers.length === 0}
              title="Descargar todas las cotizaciones en Excel"
            >
              <Download size={16} style={{ marginRight: '8px' }} />
              Descargar Excel
            </Button>
          </div>
        </div>
        <p>Registro histórico de precios (guardados en Cloudflare D1).</p>
      </div>

      <div className={`glass-panel ${styles.panel}`}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Seleccionar Ticker:</label>
          <select
            className={styles.filterSelect}
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(e.target.value)}
          >
            {tickers.length === 0 && <option value="">Sin tickers activos...</option>}
            {tickers.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.resultsArea}>
        {loading ? (
          <div className={styles.loadingState}>Cargando cotizaciones...</div>
        ) : (
          <PricesTable data={prices} />
        )}
      </div>
    </div>
  );
};
