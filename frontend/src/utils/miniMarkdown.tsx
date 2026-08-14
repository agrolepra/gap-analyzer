import React from 'react';

// Renderer liviano para el subconjunto de Markdown que devuelve Gemini en los
// resúmenes (negrita, cursiva, títulos tipo "**Título:**" en su propia línea,
// listas con * o números). No es un parser de Markdown genérico a propósito —
// evita traer una librería pesada para un caso de uso acotado.

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) parts.push(<strong key={key++}>{match[1]}</strong>);
    else if (match[2] !== undefined) parts.push(<em key={key++}>{match[2]}</em>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

interface ListBuffer {
  type: 'ul' | 'ol';
  items: string[];
}

export function renderMiniMarkdown(text: string, styles: Record<string, string>): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let list: ListBuffer | null = null;

  const flushList = () => {
    if (!list) return;
    const items = list.items;
    elements.push(
      list.type === 'ul'
        ? <ul key={`list-${elements.length}`} className={styles.aiList}>{items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}</ul>
        : <ol key={`list-${elements.length}`} className={styles.aiList}>{items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}</ol>
    );
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) { flushList(); return; }

    const headerMatch = line.match(/^\*\*(.+?)\*\*:?\s*$/);
    if (headerMatch) {
      flushList();
      elements.push(<h4 key={idx} className={styles.aiHeading}>{headerMatch[1].replace(/:$/, '')}</h4>);
      return;
    }

    const bulletMatch = line.match(/^[*-]\s+(.*)$/);
    if (bulletMatch) {
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(bulletMatch[1]);
      return;
    }

    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (numberedMatch) {
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(numberedMatch[1]);
      return;
    }

    flushList();
    elements.push(<p key={idx} className={styles.aiParagraph}>{renderInline(line)}</p>);
  });
  flushList();

  return elements;
}
