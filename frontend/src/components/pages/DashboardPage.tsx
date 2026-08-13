import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '../atoms/Button';
import { FormField } from '../molecules/FormField';
import { TickerChips } from '../atoms/TickerChips/TickerChips';
import { GapTable, type GapData } from '../organisms/GapTable/GapTable';
import { useAuth } from '../../context/AuthContext';
import styles from './DashboardPage.module.css';

export const DashboardPage: React.FC = () => {
  const { authFetch } = useAuth();
  const [tickers, setTickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [allGaps, setAllGaps] = useState<GapData[]>([]);
  const [filteredGaps, setFilteredGaps] = useState<GapData[]>([]);
  const [lastAnalysis, setLastAnalysis] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // Cargar lista persistente de tickers y último análisis
  useEffect(() => {
    const savedTickers = localStorage.getItem('dashboardTickers');
    if (savedTickers) {
      try {
        setTickers(JSON.parse(savedTickers));
      } catch (e) {
        console.error('Error cargando dashboardTickers', e);
      }
    }

    const savedState = localStorage.getItem('dashboardState');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.allGaps) setAllGaps(parsed.allGaps);
        if (parsed.filteredGaps) setFilteredGaps(parsed.filteredGaps);
        if (parsed.timestamp) setLastAnalysis(parsed.timestamp);
        if (parsed.aiSummary) setAiSummary(parsed.aiSummary);
      } catch (e) {
        console.error('Error restaurando dashboardState', e);
      }
    }
  }, []);

  const handleTickersChange = (newTickers: string[]) => {
    setTickers(newTickers);
    localStorage.setItem('dashboardTickers', JSON.stringify(newTickers));
  };

  const handleAnalyze = async () => {
    setError(null);
    
    if (tickers.length === 0) {
      setError('Por favor, agrega al menos un ticker.');
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
    setAiSummary(null);

    // Leer aiKey del localStorage si hay y está habilitada
    let aiKey: string | undefined;
    try {
      const cfg = JSON.parse(localStorage.getItem('gapAnalyzerConfig') || '{}');
      if (cfg.enableAI && cfg.aiKey) aiKey = cfg.aiKey;
    } catch (_) {}
    
    try {
      const res = await authFetch('https://gap-analyzer-worker.agrolepra.workers.dev/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, apiKey, ...(aiKey ? { aiKey } : {}) })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error en la solicitud');
      }

      const results: GapData[] = data.gaps || [];
      const filterRes = results.filter(g => g.distClosestPct <= 7);
      
      setAllGaps(results);
      setFilteredGaps(filterRes);
      if (data.aiSummary) setAiSummary(data.aiSummary);
      const ts = new Date().toISOString();
      setLastAnalysis(ts);

      // Guardar en localStorage
      localStorage.setItem('dashboardState', JSON.stringify({
        allGaps: results,
        filteredGaps: filterRes,
        aiSummary: data.aiSummary || null,
        timestamp: ts
      }));

    } catch (err: any) {
      setError(err.message || 'Error desconocido al analizar los gaps.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    if (allGaps.length === 0) return;

    const wb = XLSX.utils.book_new();

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
        <h1>Dashboard de Gaps</h1>
        <p>Analiza el mercado y encuentra oportunidades de gaps no cubiertos.</p>
        {lastAnalysis && (
           <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px'}}>
             Último análisis: {new Date(lastAnalysis).toLocaleString()}
           </p>
        )}
      </div>

      <div className={`glass-panel ${styles.panel}`}>
        <FormField 
          label="Lista de Tickers" 
          description="Escribe o pega los tickers (se autocompletan al presionar Enter, Espacio, Coma o Tab)."
        >
          <TickerChips tickers={tickers} onChange={handleTickersChange} />
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

      {aiSummary && (
        <div className="glass-panel" style={{ padding: '24px', borderLeft: '3px solid var(--accent-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.2rem' }}>✨</span>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#a5b4fc' }}>Análisis IA (GPT-4o-mini)</h3>
          </div>
          <p style={{ margin: 0, lineHeight: 1.7, color: 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
            {aiSummary}
          </p>
        </div>
      )}

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
