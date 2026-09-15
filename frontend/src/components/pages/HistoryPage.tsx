import React, { useState, useEffect, useMemo } from 'react';
import { GapTable, type GapData } from '../organisms/GapTable/GapTable';
import { Button } from '../atoms/Button';
import { useAuth } from '../../context/AuthContext';
import styles from './HistoryPage.module.css';

interface HistoryRecord extends GapData {
  id: number;
  analysis_date: string;
}

export const HistoryPage: React.FC = () => {
  const { authFetch } = useAuth();
  const [allHistory, setAllHistory] = useState<HistoryRecord[]>([]);
  const [dateFrom, setDateFrom] = useState<string>('2025-01-01');
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filteredHistory = useMemo(() => {
    if (!dateFrom || !dateTo) return allHistory;

    const fromDate = new Date(dateFrom).getTime();
    const toDate = new Date(dateTo).getTime();

    return allHistory.filter(record => {
      const recordDate = new Date(record.analysis_date).getTime();
      return recordDate >= fromDate && recordDate <= toDate;
    });
  }, [allHistory, dateFrom, dateTo]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('https://gap-analyzer-worker.agrolepra.workers.dev/history');
      if (res.status === 401) {
        throw new Error('Sesión expirada. Por favor, volvé a iniciar sesión.');
      }
      if (!res.ok) {
        throw new Error('Error al obtener el historial.');
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const historyData = Array.isArray(data) ? data : (data.results || []);
      const mapped = historyData.map((row: any) => ({
        id: row.id,
        ticker: row.ticker,
        type: row.type,
        date: row.gap_date,
        currentClose: row.current_close,
        closestPoint: row.closest_point,
        farthestPoint: row.farthest_point,
        distClosestPct: row.dist_closest_pct,
        distFarthestPct: row.dist_farthest_pct,
        widthPct: row.width_pct,
        analysis_date: row.analysis_date
      }));

      setAllHistory(mapped);
    } catch (err: any) {
      setError(err.message || 'Error desconocido.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className="text-gradient">Historial de Base de Datos</h1>
          <Button variant="secondary" onClick={loadHistory} isLoading={loading}>
            Refrescar
          </Button>
        </div>
        <p>Registro histórico de los últimos 100 gaps encontrados (guardados en Cloudflare D1).</p>
      </div>

      <div className={`glass-panel ${styles.panel}`}>
        <div className={styles.filterRow}>
          <label className={styles.dateField}>
            <span>Desde</span>
            <input
              type="date"
              className={styles.dateInput}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>

          <label className={styles.dateField}>
            <span>Hasta</span>
            <input
              type="date"
              className={styles.dateInput}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>

          <Button
            variant="secondary"
            onClick={() => {
              setDateFrom('2025-01-01');
              setDateTo(new Date().toISOString().split('T')[0]);
            }}
          >
            Resetear Fechas
          </Button>
        </div>

        <p className={styles.resultCount}>
          Mostrando {filteredHistory.length} de {allHistory.length} registros
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.resultsArea}>
        {loading ? (
          <div className={styles.loadingState}>Cargando historial desde la nube...</div>
        ) : (
          <GapTable data={filteredHistory} />
        )}
      </div>
    </div>
  );
};
