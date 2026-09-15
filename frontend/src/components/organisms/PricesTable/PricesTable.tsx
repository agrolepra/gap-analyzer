import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateDDMMYYYY as formatDate } from '../../../utils/formatDate';
import styles from './PricesTable.module.css';

export interface PriceData {
  ticker: string;
  date: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number;
}

type SortKey = keyof PriceData | 'change_pct';
type SortDir = 'asc' | 'desc';

interface PricesTableProps {
  data: PriceData[];
}

const PAGE_SIZE_OPTIONS = [100, 200, 500];

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

// Atajos sobre `date` (YYYY-MM-DD, comparable como string) — evitan tener que
// tocar los date pickers para los rangos que más se piden.
const QUICK_RANGES: { label: string; from: string | null }[] = [
  { label: 'Todo', from: null },
  { label: '1M', from: daysAgoStr(30) },
  { label: '6M', from: daysAgoStr(182) },
  { label: '1A', from: daysAgoStr(365) },
];

export const PricesTable: React.FC<PricesTableProps> = ({ data }) => {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);

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

  const filtered = useMemo(() => {
    if (!dateFrom && !dateTo) return data;
    return data.filter(row => {
      if (dateFrom && row.date < dateFrom) return false;
      if (dateTo && row.date > dateTo) return false;
      return true;
    });
  }, [data, dateFrom, dateTo]);

  const processed = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let av: any = a[sortKey as keyof PriceData];
      let bv: any = b[sortKey as keyof PriceData];

      if (sortKey === 'change_pct') {
        av = ((a.close_price - a.open_price) / a.open_price) * 100;
        bv = ((b.close_price - b.open_price) / b.open_price) * 100;
      }

      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  // Cualquier cambio que altere el total de filas (nuevo ticker, filtro, tamaño
  // de página) vuelve a la página 1 — quedarse en una página que ya no existe
  // (ej. filtrar y que la página 5 deje de tener filas) confunde más que ayuda.
  useEffect(() => {
    setPage(1);
  }, [data, dateFrom, dateTo, pageSize]);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const paginated = useMemo(
    () => processed.slice(startIdx, startIdx + pageSize),
    [processed, startIdx, pageSize]
  );

  const isQuickRangeActive = (from: string | null) => (from === null ? !dateFrom : dateFrom === from) && !dateTo;

  if (data.length === 0) {
    return <div className={styles.empty}>No se encontraron cotizaciones.</div>;
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.filterRow}>
          <div className={styles.dateFilters}>
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
          </div>
          <div className={styles.quickRanges}>
            {QUICK_RANGES.map(({ label, from }) => (
              <button
                key={label}
                type="button"
                className={`${styles.quickRangeBtn} ${isQuickRangeActive(from) ? styles.quickRangeBtnActive : ''}`}
                onClick={() => { setDateFrom(from ?? ''); setDateTo(''); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.pageSizeRow}>
          <span className={styles.resultCount}>
            {processed.length === data.length
              ? `${processed.length} registros`
              : `${processed.length} de ${data.length} registros`}
          </span>
          <label className={styles.pageSizeField}>
            <span>Filas por página</span>
            <select
              className={styles.pageSizeSelect}
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {processed.length === 0 ? (
        <div className={styles.empty}>Ningún registro coincide con el rango de fechas.</div>
      ) : (
        <>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th onClick={() => handleSort('ticker')}>Ticker {sortArrow('ticker')}</th>
                  <th className={styles.colDate} onClick={() => handleSort('date')}>Fecha {sortArrow('date')}</th>
                  <th className={styles.num} onClick={() => handleSort('close_price')}>Price {sortArrow('close_price')}</th>
                  <th className={styles.num} onClick={() => handleSort('open_price')}>Open {sortArrow('open_price')}</th>
                  <th className={styles.num} onClick={() => handleSort('high_price')}>High {sortArrow('high_price')}</th>
                  <th className={styles.num} onClick={() => handleSort('low_price')}>Low {sortArrow('low_price')}</th>
                  <th className={styles.num} onClick={() => handleSort('volume')}>Vol. {sortArrow('volume')}</th>
                  <th className={styles.num} onClick={() => handleSort('change_pct')}>Change % {sortArrow('change_pct')}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((row, index) => {
                  const changePct = ((row.close_price - row.open_price) / row.open_price) * 100;
                  const isPositive = changePct >= 0;

                  return (
                    <tr key={`${row.ticker}-${row.date}-${index}`}>
                      <td className={styles.ticker}>{row.ticker}</td>
                      <td className={styles.colDate}>{formatDate(row.date)}</td>
                      <td className={`${styles.num} ${styles.colPrice}`}>${row.close_price.toFixed(2)}</td>
                      <td className={`${styles.num} ${styles.colMuted}`}>${row.open_price.toFixed(2)}</td>
                      <td className={`${styles.num} ${styles.colHigh}`}>${row.high_price.toFixed(2)}</td>
                      <td className={`${styles.num} ${styles.colLow}`}>${row.low_price.toFixed(2)}</td>
                      <td className={`${styles.num} ${styles.colMuted}`}>{row.volume.toLocaleString()}</td>
                      <td className={styles.num} style={{ color: isPositive ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                        {isPositive ? '+' : ''}{changePct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className={styles.mobileCards}>
            {paginated.map((row, index) => {
              const changePct = ((row.close_price - row.open_price) / row.open_price) * 100;
              const isPositive = changePct >= 0;
              return (
                <div key={`${row.ticker}-${row.date}-${index}`} className={styles.mobileCard}>
                  <div className={styles.mobileCardHeader}>
                    <span className={styles.mobileTicker}>{row.ticker}</span>
                    <span style={{ color: isPositive ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      {isPositive ? '▲ +' : '▼ '}{changePct.toFixed(2)}%
                    </span>
                  </div>
                  <div className={styles.mobileCardBody}>
                    <div className={styles.mobileCardRow}>
                      <span>Fecha:</span>
                      <span>{formatDate(row.date)}</span>
                    </div>
                    <div className={styles.mobileCardRow}>
                      <span>Cierre (Price):</span>
                      <span className={styles.colPrice}>${row.close_price.toFixed(2)}</span>
                    </div>
                    <div className={styles.mobileCardRow}>
                      <span>Apertura (Open):</span>
                      <span>${row.open_price.toFixed(2)}</span>
                    </div>
                    <div className={styles.mobileCardRow}>
                      <span>Rango (H/L):</span>
                      <span>
                        <span style={{ color: 'var(--success)' }}>${row.high_price.toFixed(2)}</span> / <span style={{ color: 'var(--danger)' }}>${row.low_price.toFixed(2)}</span>
                      </span>
                    </div>
                    <div className={styles.mobileCardRow}>
                      <span>Volumen:</span>
                      <span>{row.volume.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.pagination}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <span className={styles.pageIndicator}>
              Página {currentPage} de {totalPages} — mostrando {startIdx + 1}-{Math.min(startIdx + pageSize, processed.length)} de {processed.length}
            </span>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Siguiente
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </>
  );
};
