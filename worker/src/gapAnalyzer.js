/**
 * Descarta gaps cuyo rango [bottom, top] está totalmente contenido dentro de
 * otro gap ya conservado. Procesa de mayor a menor ancho, así el más grande
 * (el que engloba) siempre se evalúa primero y sobrevive.
 */
function removeContainedGaps(gaps) {
    const sorted = [...gaps].sort((a, b) => (b.top - b.bottom) - (a.top - a.bottom));
    const kept = [];
    for (const gap of sorted) {
        const isContained = kept.some(k => gap.bottom >= k.bottom && gap.top <= k.top);
        if (!isContained) kept.push(gap);
    }
    return kept;
}

/**
 * Núcleo compartido: recorre el historial día a día, erosionando/cerrando gaps
 * activos y creando los nuevos. Cada gap nace con un sourceId estable — si una
 * cobertura parcial lo divide en dos fragmentos (Caso 4), ambos heredan el
 * mismo sourceId, así se puede reconstruir el destino final del gap original
 * aunque haya terminado partido en piezas.
 * @returns {{ survivors: Array, touchedBySource: Map<number, boolean> }}
 */
function runGapSimulation(ticker, data) {
    let activeGaps = [];
    let nextSourceId = 0;
    const touchedBySource = new Map(); // sourceId -> ¿alguna vez se erosionó parcialmente?

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
                    touchedBySource.set(gap.sourceId, true);
                    nextActiveGaps.push({ ...gap, top: cLow });
                }
                // Caso 3: Cubre la parte inferior
                else if (cLow <= gap.bottom && cHigh < gap.top) {
                    touchedBySource.set(gap.sourceId, true);
                    nextActiveGaps.push({ ...gap, bottom: cHigh });
                }
                // Caso 4: Cobertura en el medio (Divide el gap en dos)
                else if (cLow > gap.bottom && cHigh < gap.top) {
                    touchedBySource.set(gap.sourceId, true);
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
            const sourceId = nextSourceId++;
            touchedBySource.set(sourceId, false);
            activeGaps.push({
                ticker,
                sourceId,
                type: 'Bullish',
                gap_date: curr.datetime,
                bottom: pHigh,
                top: cLow
            });
        } else if (cHigh < pLow) {
            // Gap Bajista
            const sourceId = nextSourceId++;
            touchedBySource.set(sourceId, false);
            activeGaps.push({
                ticker,
                sourceId,
                type: 'Bearish',
                gap_date: curr.datetime,
                bottom: cHigh,
                top: pLow
            });
        }
    }

    // Eliminar gaps que quedaron totalmente contenidos dentro de otro gap más
    // grande (aunque sean de origen o tipo distinto — dos gaps activos pueden
    // solaparse porque cada uno se crea comparando solo contra el día previo,
    // nunca entre sí). Si el precio vuelve a esa zona, cubre ambos a la vez, así
    // que el más chico no aporta información nueva: se descarta y queda solo el
    // que engloba el rango completo.
    const survivors = removeContainedGaps(activeGaps);

    return { survivors, touchedBySource };
}

/**
 * Analiza el historial de precios para encontrar gaps no cubiertos.
 * @param {string} ticker - Símbolo de la acción.
 * @param {Array} data - Array de objetos { datetime, open, high, low, close } ORDENADOS de más antiguo a más reciente.
 * @returns {Array} Array de gaps no cubiertos procesados.
 */
export function analyzeGaps(ticker, data) {
    if (!data || data.length < 2) return [];

    const { survivors } = runGapSimulation(ticker, data);

    // Procesar los gaps activos finales para añadir métricas adicionales
    const currentPrice = parseFloat(data[data.length - 1].close);
    const analysisDate = data[data.length - 1].datetime;

    return survivors.map(gap => {
        // El punto más cercano/lejano es el que está literalmente más cerca/lejos
        // del precio actual — no se puede asumir por el tipo de gap (alcista=top,
        // bajista=bottom), porque si el precio cruzó de vuelta al otro lado del
        // gap (algo común en gaps viejos donde la acción revirtió de tendencia),
        // esa regla fija queda invertida: el borde "equivocado" termina siendo el
        // realmente más cercano.
        const distToTop = Math.abs(currentPrice - gap.top);
        const distToBottom = Math.abs(currentPrice - gap.bottom);
        const closest_point = distToTop <= distToBottom ? gap.top : gap.bottom;
        const farthest_point = distToTop <= distToBottom ? gap.bottom : gap.top;
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

/**
 * Reconstruye el destino final de cada gap que se originó alguna vez en el
 * historial (no solo los que siguen activos hoy): cuántos se originaron,
 * cuántos terminaron completamente cubiertos, y de los que siguen abiertos,
 * cuántos nunca se tocaron vs. cuántos están parcialmente erosionados.
 * @returns {{ originated: number, closedFully: number, remainingTotal: number, remainingPartial: number }}
 */
export function computeGapLifecycle(ticker, data) {
    if (!data || data.length < 2) {
        return { originated: 0, closedFully: 0, remainingTotal: 0, remainingPartial: 0 };
    }

    const { survivors, touchedBySource } = runGapSimulation(ticker, data);
    const aliveSources = new Set(survivors.map(g => g.sourceId));

    let closedFully = 0, remainingTotal = 0, remainingPartial = 0;
    for (const [sourceId, touched] of touchedBySource.entries()) {
        if (!aliveSources.has(sourceId)) {
            closedFully++;
        } else if (touched) {
            remainingPartial++;
        } else {
            remainingTotal++;
        }
    }

    return { originated: touchedBySource.size, closedFully, remainingTotal, remainingPartial };
}
