import React, { useState, useEffect } from 'react';
import { FormField } from '../molecules/FormField';
import { Input } from '../atoms/Input';
import { Toggle } from '../atoms/Toggle';
import { Button } from '../atoms/Button';
import styles from './ConfigPage.module.css';

export const ConfigPage: React.FC = () => {
  const [twelveDataKey, setTwelveDataKey] = useState('');
  const [enableAI, setEnableAI] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Cargar config al montar
    const savedConfig = localStorage.getItem('gapAnalyzerConfig');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        setTwelveDataKey(config.twelveDataKey || '');
        setEnableAI(config.enableAI || false);
        setAiKey(config.aiKey || '');
      } catch (e) {
        console.error('Error loading config', e);
      }
    }
  }, []);

  const handleSave = () => {
    const config = { twelveDataKey, enableAI, aiKey };
    localStorage.setItem('gapAnalyzerConfig', JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className="text-gradient">Configuración</h1>
        <p>Ajusta las credenciales de API y preferencias del sistema.</p>
      </div>

      <div className={`glass-panel ${styles.panel}`}>
        <h2 className={styles.sectionTitle}>Proveedores de Datos</h2>
        <FormField 
          label="Twelve Data API Key" 
          description="Necesaria para descargar el historial de precios. Obtenla gratis en twelvedata.com"
        >
          <Input 
            type="password" 
            placeholder="Introduce tu API Key de Twelve Data..." 
            value={twelveDataKey}
            onChange={(e) => setTwelveDataKey(e.target.value)}
          />
        </FormField>

        <h2 className={styles.sectionTitle} style={{ marginTop: '40px' }}>Inteligencia Artificial (Opcional)</h2>
        <FormField 
          label="Habilitar Resumen con IA" 
          description="Usa Claude o ChatGPT para redactar un resumen en lenguaje natural de los gaps encontrados."
        >
          <Toggle 
            checked={enableAI} 
            onChange={(e) => setEnableAI(e.target.checked)} 
          />
        </FormField>

        {enableAI && (
          <FormField 
            label="API Key de IA" 
            description="Tu clave secreta de OpenAI o Anthropic."
          >
            <Input 
              type="password" 
              placeholder="sk-..." 
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
            />
          </FormField>
        )}

        <div className={styles.actions}>
          <Button variant="primary" onClick={handleSave}>
            {saved ? '¡Guardado!' : 'Guardar Configuración'}
          </Button>
        </div>
      </div>
    </div>
  );
};
