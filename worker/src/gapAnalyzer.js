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
            // Si hay superposición (overlap) entre el rango del día y el gap
            if (cLow <= gap.top && cHigh >= gap.bottom) {
                // Caso 1: Cobertura total
                if (cLow <= gap.bottom && cHigh >= gap.top) {
                    continue; // Se elimina el gap (no lo agregamos a nextActiveGaps)
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
                // Sin cobertura hoy, el gap sigue intacto
                nextActiveGaps.push(gap);
            }
        }
        activeGaps = nextActiveGaps;
        
        // 2. Detectar nuevos gaps de hoy
        if (cLow > pHigh) {
            // Gap Alcista
            activeGaps.push({
                ticker: ticker,
                type: 'Alcista',
                date: curr.datetime,
                top: cLow,
                bottom: pHigh
            });
        } else if (cHigh < pLow) {
            // Gap Bajista
            activeGaps.push({
                ticker: ticker,
                type: 'Bajista',
                date: curr.datetime,
                top: pLow,
                bottom: cHigh
            });
        }
    }
    
    // 3. Dar formato a los resultados
    let currentClose = parseFloat(data[data.length - 1].close);
    
    return activeGaps.map(gap => {
        let dTop = Math.abs(currentClose - gap.top);
        let dBot = Math.abs(currentClose - gap.bottom);
        
        let closestPoint = dTop < dBot ? gap.top : gap.bottom;
        let farthestPoint = dTop > dBot ? gap.top : gap.bottom;
        
        let distClosestPct = (Math.abs(currentClose - closestPoint) / currentClose) * 100;
        let distFarthestPct = (Math.abs(currentClose - farthestPoint) / currentClose) * 100;
        let widthPct = (Math.abs(gap.top - gap.bottom) / ((gap.top + gap.bottom) / 2)) * 100;
        
        return {
            ticker: gap.ticker,
            type: gap.type,
            date: gap.date,
            currentClose: currentClose,
            closestPoint: closestPoint,
            farthestPoint: farthestPoint,
            distClosestPct: distClosestPct,
            distFarthestPct: distFarthestPct,
            widthPct: widthPct
        };
    });
}
