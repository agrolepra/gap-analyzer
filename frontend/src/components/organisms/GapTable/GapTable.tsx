import React, { useState, useMemo } from 'react';
import { formatDateDDMMYYYY as formatDate } from '../../../utils/formatDate';
import styles from './GapTable.module.css';

export interface GapData {
  ticker: string;
  type: 'Bullish' | 'Bearish';
  date: string;
  currentClose: number;
  closestPoint: number;
  farthestPoint: number;
  distClosestPct: number;
  distFarthestPct: number;
  widthPct: number;
}

type SortKey = keyof GapData;
type SortDir = 'asc' | 'desc';

interface GapTableProps {
  data: GapData[];
  showFilters?: boolean;
}

function getDistColor(pct: number): string {
  if (pct < 3) return '#f97316';   // naranja urgente
  if (pct < 7) return '#eab308';   // amarillo
  return '#a0a0ab';                 // gris normal
}

export const GapTable: React.FC<GapTableProps> = ({ data, showFilters = true }) => {
  const [sortKey, setSortKey] = useState<SortKey>('distClosestPct');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterTicker, setFilterTicker] = useState('');
  const [filterType, setFilterType] = useState<'' | 'Bullish' | 'Bearish'>('');
  const [filterMaxDist, setFilterMaxDist] = useState('');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return <span className={styles.sortIcon}>↕</span>;
    return <span className={styles.sortIconActive}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const processed = useMemo(() => {
    let filtered = [...data];
    if (filterTicker) filtered = filtered.filter(g => g.ticker.toUpperCase().includes(filterTicker.toUpperCase()));
    if (filterType) filtered = filtered.filter(g => g.type === filterType);
    if (filterMaxDist) filtered = filtered.filter(g => g.distClosestPct <= parseFloat(filterMaxDist));

    filtered.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return filtered;
  }, [data, filterTicker, filterType, filterMaxDist, sortKey, sortDir]);

  if (data.length === 0) {
    return <div className={styles.empty}>No se encontraron gaps no cubiertos.</div>;
  }

  return (
    <div>
      {showFilters && (
        <div className={styles.filters}>
          <input
            className={styles.filterInput}
            placeholder="Filtrar ticker..."
            value={filterTicker}
            onChange={e => setFilterTicker(e.target.value)}
          />
          <select
            className={styles.filterSelect}
            value={filterType}
            onChange={e => setFilterType(e.target.value as '' | 'Bullish' | 'Bearish')}
          >
            <option value="">Todos los tipos</option>
            <option value="Bullish">Bullish ↑</option>
            <option value="Bearish">Bearish ↓</option>
          </select>
          <div className={styles.filterInputGroup}>
            <input
              className={styles.filterInput}
              type="number"
              placeholder="Dist. máx. %"
              value={filterMaxDist}
              onChange={e => setFilterMaxDist(e.target.value)}
              min="0"
            />
          </div>
          <span className={styles.resultCount}>{processed.length} gaps</span>
        </div>
      )}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th onClick={() => handleSort('ticker')}>Ticker {sortArrow('ticker')}</th>
              <th onClick={() => handleSort('type')}>Tipo {sortArrow('type')}</th>
              <th className={styles.colDate} onClick={() => handleSort('date')}>Fecha Gap {sortArrow('date')}</th>
              <th className={styles.num} onClick={() => handleSort('currentClose')}>Cierre Actual {sortArrow('currentClose')}</th>
              <th className={styles.num} onClick={() => handleSort('closestPoint')}>Punto Cercano {sortArrow('closestPoint')}</th>
              <th className={styles.num} onClick={() => handleSort('farthestPoint')}>Punto Lejano {sortArrow('farthestPoint')}</th>
              <th className={styles.num} onClick={() => handleSort('distClosestPct')}>% Dist. Cercano {sortArrow('distClosestPct')}</th>
              <th className={styles.num} onClick={() => handleSort('distFarthestPct')}>% Dist. Lejano {sortArrow('distFarthestPct')}</th>
              <th className={styles.num} onClick={() => handleSort('widthPct')}>% Ancho {sortArrow('widthPct')}</th>
            </tr>
          </thead>
          <tbody>
            {processed.map((gap, index) => {
              const isBullish = gap.type === 'Bullish';
              return (
                <tr key={`${gap.ticker}-${index}`}>
                  <td className={styles.ticker}>{gap.ticker}</td>
                  <td>
                    <span className={`${styles.badge} ${isBullish ? styles.bullish : styles.bearish}`}>
                      {isBullish ? '↑ Bullish' : '↓ Bearish'}
                    </span>
                  </td>
                  <td className={styles.colDate}>{formatDate(gap.date)}</td>
                  <td className={`${styles.num} ${styles.colPrice}`}>${gap.currentClose?.toFixed(2)}</td>
                  <td className={`${styles.num} ${styles.colMuted}`}>${gap.closestPoint?.toFixed(2)}</td>
                  <td className={`${styles.num} ${styles.colMuted}`}>${gap.farthestPoint?.toFixed(2)}</td>
                  <td className={styles.num} style={{ color: getDistColor(gap.distClosestPct), fontWeight: 700 }}>
                    {gap.distClosestPct?.toFixed(2)}%
                  </td>
                  <td className={styles.num} style={{ color: getDistColor(gap.distFarthestPct) }}>
                    {gap.distFarthestPct?.toFixed(2)}%
                  </td>
                  <td className={`${styles.num} ${styles.colMuted}`}>{gap.widthPct?.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Layout */}
      <div className={styles.mobileCards}>
        {processed.map((gap, index) => {
          const isBullish = gap.type === 'Bullish';
          return (
            <div key={`${gap.ticker}-${index}`} className={styles.mobileCard}>
              <div className={styles.mobileCardHeader}>
                <span className={styles.mobileTicker}>{gap.ticker}</span>
                <span className={`${styles.badge} ${isBullish ? styles.bullish : styles.bearish}`}>
                  {isBullish ? '↑ Bull' : '↓ Bear'}
                </span>
              </div>
              <div className={styles.mobileCardBody}>
                <div className={styles.mobileCardRow}>
                  <span>Fecha Gap:</span>
                  <span>{formatDate(gap.date)}</span>
                </div>
                <div className={styles.mobileCardRow}>
                  <span>Precio Actual:</span>
                  <span className={styles.colPrice}>${gap.currentClose?.toFixed(2)}</span>
                </div>
                <div className={styles.mobileCardRow}>
                  <span>Dist. Cercano:</span>
                  <span style={{ color: getDistColor(gap.distClosestPct), fontWeight: 700 }}>
                    {gap.distClosestPct?.toFixed(2)}% (${gap.closestPoint?.toFixed(2)})
                  </span>
                </div>
                <div className={styles.mobileCardRow}>
                  <span>Dist. Lejano:</span>
                  <span style={{ color: getDistColor(gap.distFarthestPct) }}>
                    {gap.distFarthestPct?.toFixed(2)}% (${gap.farthestPoint?.toFixed(2)})
                  </span>
                </div>
                <div className={styles.mobileCardRow}>
                  <span>Ancho Gap:</span>
                  <span className={styles.colMuted}>{gap.widthPct?.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
