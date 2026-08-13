import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import { PricesTable, type PriceData } from '../organisms/PricesTable/PricesTable';
import { Button } from '../atoms/Button';
import { useAuth } from '../../context/AuthContext';
import styles from './PricesPage.module.css';

export const PricesPage: React.FC = () => {
  const { authFetch } = useAuth();
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [tickers, setTickers] = useState<string[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTickers = async () => {
    try {
      const res = await authFetch('https://gap-analyzer-worker.agrolepra.workers.dev/prices');
      if (res.ok) {
        const data = await res.json();
        if (data.tickers && data.tickers.length > 0) {
          setTickers(data.tickers);
          setSelectedTicker(data.tickers[0]);
        }
      }
    } catch (err) {
      console.error("Error loading tickers:", err);
    }
  };

  const loadPrices = async (ticker: string) => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`https://gap-analyzer-worker.agrolepra.workers.dev/prices?ticker=${ticker}`);
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
    setDownloading(true);
    setError(null);
    try {
      const workbook = XLSX.utils.book_new();

      for (const ticker of tickers) {
        const res = await authFetch(`https://gap-analyzer-worker.agrolepra.workers.dev/prices?ticker=${ticker}`);
        if (!res.ok) continue;

        const data = await res.json();
        const tickerData = (data.results || []).map((row: any) => ({
          Fecha: row.date,
          Apertura: row.open_price,
          Máximo: row.high_price,
          Mínimo: row.low_price,
          Cierre: row.close_price,
          Volumen: row.volume,
        }));

        if (tickerData.length > 0) {
          const worksheet = XLSX.utils.json_to_sheet(tickerData);
          worksheet['!cols'] = [
            { wch: 12 },
            { wch: 12 },
            { wch: 12 },
            { wch: 12 },
            { wch: 12 },
            { wch: 15 },
          ];
          XLSX.utils.book_append_sheet(workbook, worksheet, ticker);
        }
      }

      const fileName = `cotizaciones_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
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
    if (selectedTicker) {
      loadPrices(selectedTicker);
    }
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
            {tickers.length === 0 && <option value="">Sin datos...</option>}
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
