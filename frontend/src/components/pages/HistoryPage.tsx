import React, { useState, useEffect } from 'react';
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
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      // Mapear desde el formato de DB al formato esperado por GapTable
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
      
      setHistory(mapped);
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

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.resultsArea}>
        {loading ? (
          <div className={styles.loadingState}>Cargando historial desde la nube...</div>
        ) : (
          <GapTable data={history} />
        )}
      </div>
    </div>
  );
};
