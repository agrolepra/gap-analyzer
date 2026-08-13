import React, { useState, useEffect } from 'react';
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
          <Button variant="secondary" onClick={() => loadPrices(selectedTicker)} isLoading={loading}>
            Refrescar
          </Button>
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
