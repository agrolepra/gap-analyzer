import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { FormField } from '../molecules/FormField';
import { Input } from '../atoms/Input';
import { Toggle } from '../atoms/Toggle';
import { Button } from '../atoms/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import styles from './ConfigPage.module.css';

const WORKER = 'https://gap-analyzer-worker.agrolepra.workers.dev';
const DEFAULT_UPDATE_HOUR = '21:30';

interface TickerRow {
  ticker: string;
  active: number;
  created_at: string;
}

export const ConfigPage: React.FC = () => {
  const { authFetch } = useAuth();
  const { showToast } = useToast();

  const [tickers, setTickers] = useState<TickerRow[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [addingTicker, setAddingTicker] = useState(false);
  const [togglingTicker, setTogglingTicker] = useState<string | null>(null);

  const [updateHour, setUpdateHour] = useState(DEFAULT_UPDATE_HOUR);
  const [savingHour, setSavingHour] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tickersRes, settingsRes] = await Promise.all([
        authFetch(`${WORKER}/tickers`),
        authFetch(`${WORKER}/settings`),
      ]);
      const tickersData = await tickersRes.json();
      if (!tickersRes.ok) throw new Error(tickersData.error || 'Error al cargar tickers');
      setTickers(tickersData.tickers || []);

      const settingsData = await settingsRes.json();
      if (settingsRes.ok && settingsData.settings?.update_hour_utc) {
        setUpdateHour(settingsData.settings.update_hour_utc);
      }
    } catch (err: any) {
      setError(err.message || 'Error desconocido al cargar la configuración.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const addTicker = async () => {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) return;
    setAddingTicker(true);
    setError(null);
    try {
      const res = await authFetch(`${WORKER}/tickers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al agregar el ticker');

      if (data.status === 'created') {
        showToast(`Ticker ${ticker} agregado, iniciando carga histórica…`, 'success');
      } else if (data.status === 'reactivated') {
        showToast(`Ticker ${ticker} reactivado, completando datos faltantes…`, 'success');
      } else {
        showToast(`${ticker} ya estaba activo`, 'info');
      }

      setNewTicker('');
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Error desconocido al agregar el ticker.');
    } finally {
      setAddingTicker(false);
    }
  };

  const toggleTicker = async (ticker: string, active: boolean) => {
    setTogglingTicker(ticker);
    setError(null);
    try {
      const res = await authFetch(`${WORKER}/tickers/${ticker}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar el ticker');

      showToast(active ? `Ticker ${ticker} activado` : `Ticker ${ticker} ocultado`, 'success');
      setTickers(prev => prev.map(t => t.ticker === ticker ? { ...t, active: active ? 1 : 0 } : t));
    } catch (err: any) {
      setError(err.message || 'Error desconocido al actualizar el ticker.');
    } finally {
      setTogglingTicker(null);
    }
  };

  const saveUpdateHour = async () => {
    setSavingHour(true);
    setError(null);
    try {
      const res = await authFetch(`${WORKER}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'update_hour_utc', value: updateHour }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar la hora');
      showToast('Hora de actualización guardada', 'success');
    } catch (err: any) {
      setError(err.message || 'Error desconocido al guardar la hora.');
    } finally {
      setSavingHour(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className="text-gradient">Configuración</h1>
        <p>Gestioná los tickers monitoreados y el horario de actualización automática.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={`glass-panel ${styles.panel}`}>
        <h2 className={styles.sectionTitle}>Tickers</h2>
        <p className={styles.sectionDesc}>
          Al agregar un ticker se carga automáticamente su historial desde 01/01/2025 en segundo plano.
          Al desactivarlo, se oculta de Dashboard, Gaps y Cotizaciones — sus datos no se eliminan y dejan
          de consumir la API mientras esté inactivo. Al reactivarlo, solo se completa lo que falte.
        </p>

        <div className={styles.addRow}>
          <Input
            placeholder="Ej: AAPL"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') addTicker(); }}
          />
          <Button variant="primary" onClick={addTicker} isLoading={addingTicker} disabled={!newTicker.trim()}>
            <Plus size={16} style={{ marginRight: '6px' }} />
            Agregar
          </Button>
        </div>

        {loading ? (
          <div className={styles.loadingState}>Cargando tickers...</div>
        ) : (
          <div className={styles.tickerList}>
            {tickers.length === 0 && <p className={styles.sectionDesc}>Todavía no hay tickers configurados.</p>}
            {tickers.map(t => (
              <div key={t.ticker} className={styles.tickerRow}>
                <span className={`${styles.tickerName} ${t.active ? '' : styles.tickerInactive}`}>{t.ticker}</span>
                <Toggle
                  checked={t.active === 1}
                  disabled={togglingTicker === t.ticker}
                  onChange={(e) => toggleTicker(t.ticker, e.target.checked)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`glass-panel ${styles.panel}`}>
        <h2 className={styles.sectionTitle}>Actualización Automática</h2>
        <FormField
          label="Hora de actualización (UTC)"
          description="El cierre de NYSE ronda 20:00–21:00 UTC según horario de verano. Por defecto se corre unos minutos después."
        >
          <Input
            type="time"
            value={updateHour}
            onChange={(e) => setUpdateHour(e.target.value)}
            style={{ maxWidth: '160px' }}
          />
        </FormField>
        <div className={styles.actions}>
          <Button variant="primary" onClick={saveUpdateHour} isLoading={savingHour}>
            Guardar Hora
          </Button>
        </div>
      </div>
    </div>
  );
};
