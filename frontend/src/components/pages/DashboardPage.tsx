import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { FormField } from '../molecules/FormField';
import { GapTable, GapData } from '../organisms/GapTable/GapTable';
import styles from './DashboardPage.module.css';

export const DashboardPage: React.FC = () => {
  const [tickersInput, setTickersInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [allGaps, setAllGaps] = useState<GapData[]>([]);
  const [filteredGaps, setFilteredGaps] = useState<GapData[]>([]);

  const handleAnalyze = async () => {
    setError(null);
    const tickers = tickersInput.split(/[\n,;\s]+/).map(t => t.trim().toUpperCase()).filter(t => t);
    
    if (tickers.length === 0) {
      setError('Por favor, ingresa al menos un ticker.');
      return;
    }

    const savedConfig = localStorage.getItem('gapAnalyzerConfig');
    if (!savedConfig) {
      setError('No hay API Key configurada. Ve a Configuración primero.');
      return;
    }
    
    let apiKey = '';
    try {
      apiKey = JSON.parse(savedConfig).twelveDataKey;
    } catch (e) {
      setError('Error al leer la configuración.');
      return;
    }

    if (!apiKey) {
      setError('La API Key de Twelve Data es obligatoria. Ve a Configuración.');
      return;
    }

    setLoading(true);
    
    try {
      // Usar URL local por ahora (en prod se ajustaría)
      const res = await fetch('http://localhost:8787/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, apiKey })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error en la solicitud');
      }

      const results: GapData[] = data.gaps || [];
      
      setAllGaps(results);
      setFilteredGaps(results.filter(g => g.distClosestPct <= 7));

    } catch (err: any) {
      setError(err.message || 'Error desconocido al analizar los gaps.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    if (allGaps.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen General
    const wsAll = XLSX.utils.json_to_sheet(allGaps.map(g => ({
      'Ticker': g.ticker,
      'Tipo': g.type,
      'Fecha del Gap': g.date.split(' ')[0],
      'Cierre Actual': g.currentClose,
      'Punto más cercano': g.closestPoint,
      'Punto más lejano': g.farthestPoint,
      '% dist. Punto Cercano': g.distClosestPct,
      '% dist. Punto Lejano': g.distFarthestPct,
      '% Ancho Gap': g.widthPct
    })));
    XLSX.utils.book_append_sheet(wb, wsAll, "Resumen General");

    // Hoja 2: Gaps <= 7%
    const wsFiltered = XLSX.utils.json_to_sheet(filteredGaps.map(g => ({
      'Ticker': g.ticker,
      'Tipo': g.type,
      'Fecha del Gap': g.date.split(' ')[0],
      'Cierre Actual': g.currentClose,
      'Punto más cercano': g.closestPoint,
      'Punto más lejano': g.farthestPoint,
      '% dist. Punto Cercano': g.distClosestPct,
      '% dist. Punto Lejano': g.distFarthestPct,
      '% Ancho Gap': g.widthPct
    })));
    XLSX.utils.book_append_sheet(wb, wsFiltered, "Gaps Cercanos (<= 7%)");

    XLSX.writeFile(wb, `Reporte_Gaps_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className="text-gradient">Dashboard de Gaps</h1>
        <p>Analiza el mercado y encuentra oportunidades de gaps no cubiertos.</p>
      </div>

      <div className={`glass-panel ${styles.panel}`}>
        <FormField 
          label="Lista de Tickers" 
          description="Pega aquí los símbolos separados por coma, espacio o saltos de línea (ej. AAPL, MSFT, TSLA)."
        >
          <Input 
            multiline 
            placeholder="AAPL&#10;MSFT&#10;TSLA" 
            value={tickersInput}
            onChange={(e) => setTickersInput(e.target.value)}
          />
        </FormField>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <Button isLoading={loading} onClick={handleAnalyze}>
            Analizar Mercado
          </Button>
          <Button 
            variant="secondary" 
            disabled={allGaps.length === 0 || loading} 
            onClick={handleDownloadExcel}
          >
            Descargar Excel
          </Button>
        </div>
      </div>

      {allGaps.length > 0 && (
        <div className={styles.resultsArea}>
          <h2 className={styles.tableTitle}>Resumen General ({allGaps.length} gaps)</h2>
          <GapTable data={allGaps} />

          <h2 className={styles.tableTitle} style={{ marginTop: '40px' }}>
            Gaps a &lt;= 7% de distancia ({filteredGaps.length} gaps)
          </h2>
          <GapTable data={filteredGaps} />
        </div>
      )}
    </div>
  );
};
