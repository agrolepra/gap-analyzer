/**
 * Analiza el historial de precios para encontrar gaps no cubiertos.
 * @param {string} ticker - Símbolo de la acción.
 * @param {Array} data - Array de objetos { datetime, open, high, low, close } ORDENADOS de más antiguo a más reciente.
 * @returns {Array} Array de gaps no cubiertos procesados.
 */
export function analyzeGaps(ticker, data) {
    if (!data || data.length < 2) return [];

    let activeGaps = []; 
    
    for (let i = 1; i < data.length; i++) {
        let prev = data[i-1];
        let curr = data[i];
        
        let pHigh = parseFloat(prev.high);
        let pLow = parseFloat(prev.low);
        let cHigh = parseFloat(curr.high);
        let cLow = parseFloat(curr.low);
        
        // 1. Procesar gaps activos contra el rango del día actual (forward fill)
        let nextActiveGaps = [];
        for (let gap of activeGaps) {
            if (cLow <= gap.top && cHigh >= gap.bottom) {
                // Caso 1: Cobertura total
                if (cLow <= gap.bottom && cHigh >= gap.top) {
                    continue; // Se cierra el gap completamente
                }
                // Caso 2: Cubre la parte superior
                else if (cLow > gap.bottom && cHigh >= gap.top) {
                    nextActiveGaps.push({ ...gap, top: cLow });
                }
                // Caso 3: Cubre la parte inferior
                else if (cLow <= gap.bottom && cHigh < gap.top) {
                    nextActiveGaps.push({ ...gap, bottom: cHigh });
                }
                // Caso 4: Cobertura en el medio (Divide el gap en dos)
                else if (cLow > gap.bottom && cHigh < gap.top) {
                    nextActiveGaps.push({ ...gap, top: cLow });
                    nextActiveGaps.push({ ...gap, bottom: cHigh });
                }
            } else {
                nextActiveGaps.push(gap);
            }
        }
        activeGaps = nextActiveGaps;
        
        // 2. Detectar nuevos gaps de hoy
        if (cLow > pHigh) {
            // Gap Alcista
            activeGaps.push({
                ticker,
                type: 'Bullish',
                gap_date: curr.datetime,
                bottom: pHigh,
                top: cLow
            });
        } else if (cHigh < pLow) {
            // Gap Bajista
            activeGaps.push({
                ticker,
                type: 'Bearish',
                gap_date: curr.datetime,
                bottom: cHigh,
                top: pLow
            });
        }
    }
    
    // Procesar los gaps activos finales para añadir métricas adicionales
    const currentPrice = parseFloat(data[data.length - 1].close);
    const analysisDate = data[data.length - 1].datetime;

    return activeGaps.map(gap => {
        const closest_point = gap.type === 'Bullish' ? gap.top : gap.bottom;
        const farthest_point = gap.type === 'Bullish' ? gap.bottom : gap.top;
        const dist_closest_pct = Math.abs((currentPrice - closest_point) / currentPrice) * 100;
        const dist_farthest_pct = Math.abs((currentPrice - farthest_point) / currentPrice) * 100;
        const width_pct = Math.abs((gap.top - gap.bottom) / gap.bottom) * 100;

        return {
            ...gap,
            closest_point,
            farthest_point,
            dist_closest_pct,
            dist_farthest_pct,
            width_pct,
            current_close: currentPrice,
            analysis_date: analysisDate
        };
    });
}