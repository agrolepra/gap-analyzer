import React, { useState, useRef } from 'react';
import styles from './TickerChips.module.css';

interface TickerChipsProps {
  tickers: string[];
  onChange: (tickers: string[]) => void;
}

export const TickerChips: React.FC<TickerChipsProps> = ({ tickers, onChange }) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTicker = (raw: string) => {
    const parts = raw.split(/[\n,;\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
    const unique = parts.filter(t => !tickers.includes(t));
    if (unique.length) onChange([...tickers, ...unique]);
    setInputValue('');
  };

  const removeTicker = (ticker: string) => {
    onChange(tickers.filter(t => t !== ticker));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ' ', 'Tab'].includes(e.key) && inputValue.trim()) {
      e.preventDefault();
      addTicker(inputValue);
    }
    if (e.key === 'Backspace' && !inputValue && tickers.length > 0) {
      removeTicker(tickers[tickers.length - 1]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    addTicker(pasted);
  };

  return (
    <div
      className={styles.container}
      onClick={() => inputRef.current?.focus()}
    >
      {tickers.map(ticker => (
        <span key={ticker} className={styles.chip}>
          {ticker}
          <button
            type="button"
            className={styles.chipRemove}
            onClick={e => { e.stopPropagation(); removeTicker(ticker); }}
            aria-label={`Quitar ${ticker}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        className={styles.input}
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => inputValue.trim() && addTicker(inputValue)}
        placeholder={tickers.length === 0 ? 'Ej: AAPL, MSFT, TSLA...' : 'Agregar ticker...'}
      />
    </div>
  );
};
