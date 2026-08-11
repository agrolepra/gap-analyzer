import React from 'react';
import styles from './GapTable.module.css';

export interface GapData {
  ticker: string;
  type: 'Alcista' | 'Bajista';
  date: string;
  currentClose: number;
  closestPoint: number;
  farthestPoint: number;
  distClosestPct: number;
  distFarthestPct: number;
  widthPct: number;
}

interface GapTableProps {
  data: GapData[];
}

export const GapTable: React.FC<GapTableProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className={styles.empty}>
        No se encontraron gaps no cubiertos.
      </div>
    );
  }

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Tipo</th>
            <th>Fecha Gap</th>
            <th className={styles.num}>Cierre Actual</th>
            <th className={styles.num}>Punto Cercano</th>
            <th className={styles.num}>Punto Lejano</th>
            <th className={styles.num}>% Dist. Cercano</th>
            <th className={styles.num}>% Dist. Lejano</th>
            <th className={styles.num}>% Ancho</th>
          </tr>
        </thead>
        <tbody>
          {data.map((gap, index) => {
            const isBullish = gap.type === 'Alcista';
            const typeClass = isBullish ? styles.bullish : styles.bearish;
            
            return (
              <tr key={`${gap.ticker}-${index}`}>
                <td className={styles.ticker}>{gap.ticker}</td>
                <td>
                  <span className={`${styles.badge} ${typeClass}`}>
                    {gap.type}
                  </span>
                </td>
                <td>{gap.date.split(' ')[0]}</td>
                <td className={styles.num}>${gap.currentClose.toFixed(2)}</td>
                <td className={styles.num}>${gap.closestPoint.toFixed(2)}</td>
                <td className={styles.num}>${gap.farthestPoint.toFixed(2)}</td>
                <td className={styles.num}>
                  <strong>{gap.distClosestPct.toFixed(2)}%</strong>
                </td>
                <td className={styles.num}>{gap.distFarthestPct.toFixed(2)}%</td>
                <td className={styles.num}>{gap.widthPct.toFixed(2)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
