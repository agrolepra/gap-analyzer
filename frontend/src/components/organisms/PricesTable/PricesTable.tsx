import React, { useState, useMemo } from 'react';
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

export const PricesTable: React.FC<PricesTableProps> = ({ data }) => {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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
    let list = [...data];
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
  }, [data, sortKey, sortDir]);

  if (data.length === 0) {
    return <div className={styles.empty}>No se encontraron cotizaciones.</div>;
  }

  return (
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
          {processed.map((row, index) => {
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
      {processed.map((row, index) => {
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
  </>
);
};
