import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Upload, ChevronDown, ChevronRight } from 'lucide-react';
import { FormField } from '../molecules/FormField';
import { Input } from '../atoms/Input';
import { Toggle } from '../atoms/Toggle';
import { Button } from '../atoms/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDateTimeBA } from '../../utils/formatDate';
import styles from './ConfigPage.module.css';

const WORKER = 'https://gap-analyzer-worker.agrolepra.workers.dev';

// Buenos Aires es UTC-3 todo el año (Argentina no tiene horario de verano).
const BA_OFFSET_HOURS = 3;
const DEFAULT_UPDATE_HOUR_BA = '18:30';

function utcToBA(utcHHMM: string): string {
  const [h, m] = utcHHMM.split(':').map(Number);
  let baH = h - BA_OFFSET_HOURS;
  if (baH < 0) baH += 24;
  return `${String(baH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function baToUTC(baHHMM: string): string {
  const [h, m] = baHHMM.split(':').map(Number);
  let utcH = h + BA_OFFSET_HOURS;
  if (utcH >= 24) utcH -= 24;
  return `${String(utcH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface TickerRow {
  ticker: string;
  active: number;
  created_at: string;
  last_updated: string | null;
}

function lastUpdatedLabel(lastUpdated: string | null): string {
  return lastUpdated ? `Actualizado: ${formatDateTimeBA(lastUpdated)}` : 'Todavía sin cotizaciones cargadas';
}

export const ConfigPage: React.FC = () => {
  const { authFetch } = useAuth();
  const { showToast } = useToast();

  const [tickers, setTickers] = useState<TickerRow[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [addingTicker, setAddingTicker] = useState(false);
  const [togglingTicker, setTogglingTicker] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);

  const [updateHourBA, setUpdateHourBA] = useState(DEFAULT_UPDATE_HOUR_BA);
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
        setUpdateHourBA(utcToBA(settingsData.settings.update_hour_utc));
      }
    } catch (err: any) {
      setError(err.message || 'Error desconocido al cargar la configuración.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // POST /tickers para un solo símbolo. El backend ya es idempotente (guards
  // anti-duplicado, reactivación con catch-up), así que es seguro reusar esto
  // tanto para el alta individual como para cada ticker de una importación masiva.
  const submitTicker = async (ticker: string): Promise<{ ticker: string; status: string }> => {
    const res = await authFetch(`${WORKER}/tickers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error al agregar ${ticker}`);
    return data;
  };

  const addTicker = async () => {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) return;
    setAddingTicker(true);
    setError(null);
    try {
      const data = await submitTicker(ticker);

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

  const bulkImport = async () => {
    const parsed = Array.from(new Set(
      bulkText.split(/[\n,;\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
    ));
    if (parsed.length === 0) return;

    setBulkImporting(true);
    setError(null);
    try {
      // Un solo request: el backend valida en batches de hasta 8 tickers por
      // llamada a TwelveData (igual que la ingesta) y encola un solo job de
      // backfill combinado para los nuevos válidos — ya respeta el límite de
      // 8 req/min sin necesidad de espaciar nada acá.
      const res = await authFetch(`${WORKER}/tickers/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en la importación masiva');

      const parts = [];
      if (data.created?.length) parts.push(`${data.created.length} agregados`);
      if (data.reactivated?.length) parts.push(`${data.reactivated.length} reactivados`);
      if (data.alreadyActive?.length) parts.push(`${data.alreadyActive.length} ya activos`);
      if (data.invalid?.length) parts.push(`${data.invalid.length} inválidos (${data.invalid.join(', ')})`);
      showToast(`Importación: ${parts.join(', ') || 'sin cambios'}`, data.invalid?.length ? 'error' : 'success');

      setBulkText('');
      setShowBulkImport(false);
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Error desconocido en la importación masiva.');
    } finally {
      setBulkImporting(false);
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

  const filteredTickers = useMemo(() => {
    const q = filterText.trim().toUpperCase();
    if (!q) return tickers;
    return tickers.filter(t => t.ticker.includes(q));
  }, [tickers, filterText]);

  // Al desactivar/reactivar, toggleTicker ya actualiza `tickers` en memoria —
  // como esta partición se deriva de ese mismo estado, el ticker se reubica
  // de sección al instante, sin recargar nada.
  const activeTickers = useMemo(() => filteredTickers.filter(t => t.active === 1), [filteredTickers]);
  const inactiveTickers = useMemo(() => filteredTickers.filter(t => t.active === 0), [filteredTickers]);

  const saveUpdateHour = async () => {
    setSavingHour(true);
    setError(null);
    try {
      const res = await authFetch(`${WORKER}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'update_hour_utc', value: baToUTC(updateHourBA) }),
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
          <Button variant="secondary" onClick={() => setShowBulkImport(v => !v)}>
            <Upload size={16} style={{ marginRight: '6px' }} />
            Importar varios
          </Button>
        </div>

        {showBulkImport && (
          <div className={styles.bulkImportBox}>
            <Input
              multiline
              placeholder={'Pegá varios tickers separados por coma, espacio o salto de línea.\nEj: AAPL, MSFT, TSLA'}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              style={{ minHeight: '90px', width: '100%' }}
            />
            <div className={styles.actions} style={{ marginTop: '12px' }}>
              <Button variant="primary" onClick={bulkImport} isLoading={bulkImporting} disabled={!bulkText.trim()}>
                Importar todos
              </Button>
            </div>
          </div>
        )}

        <div className={styles.searchRow}>
          <Search size={16} className={styles.searchIcon} />
          <Input
            placeholder="Buscar ticker..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className={styles.searchInput}
          />
          {tickers.length > 0 && (
            <span className={styles.tickerCount}>{filteredTickers.length} / {tickers.length}</span>
          )}
        </div>

        {loading ? (
          <div className={styles.loadingState}>Cargando tickers...</div>
        ) : (
          <>
            {tickers.length === 0 && <p className={styles.sectionDesc}>Todavía no hay tickers configurados.</p>}
            {tickers.length > 0 && filteredTickers.length === 0 && (
              <p className={styles.sectionDesc}>Ningún ticker coincide con "{filterText}".</p>
            )}

            {activeTickers.length > 0 && (
              <div className={styles.tickerGrid}>
                {activeTickers.map(t => (
                  <div key={t.ticker} className={styles.tickerChip} title={lastUpdatedLabel(t.last_updated)}>
                    <span className={styles.tickerName}>{t.ticker}</span>
                    <Toggle
                      checked={t.active === 1}
                      disabled={togglingTicker === t.ticker}
                      onChange={(e) => toggleTicker(t.ticker, e.target.checked)}
                    />
                  </div>
                ))}
              </div>
            )}

            {inactiveTickers.length > 0 && (
              <div className={styles.inactiveSection}>
                <button
                  type="button"
                  className={styles.inactiveToggle}
                  onClick={() => setShowInactive(v => !v)}
                >
                  {showInactive ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span>Desactivados ({inactiveTickers.length})</span>
                </button>
                {showInactive && (
                  <div className={styles.tickerGrid}>
                    {inactiveTickers.map(t => (
                      <div key={t.ticker} className={styles.tickerChip} title={lastUpdatedLabel(t.last_updated)}>
                        <span className={`${styles.tickerName} ${styles.tickerInactive}`}>{t.ticker}</span>
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
            )}
          </>
        )}
      </div>

      <div className={`glass-panel ${styles.panel}`}>
        <h2 className={styles.sectionTitle}>Actualización Automática</h2>
        <FormField
          label="Hora de actualización (Buenos Aires)"
          description="El cierre de NYSE en horario de Buenos Aires es ~17:00 (horario de verano en EE.UU., marzo–noviembre) o ~18:00 (resto del año). Por defecto se corre unos minutos después del más tardío para cubrir ambos casos; ajustá si querés más precisión."
        >
          <Input
            type="time"
            value={updateHourBA}
            onChange={(e) => setUpdateHourBA(e.target.value)}
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
