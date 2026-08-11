export async function generateSummary(gaps, apiKey) {
    if (!apiKey) return null;

    // Filtramos solo los gaps relevantes para no exceder los tokens (ej. <= 7%)
    const relevantGaps = gaps.filter(g => g.distClosestPct <= 7);
    
    if (relevantGaps.length === 0) {
        return "No se encontraron gaps relevantes (a menos del 7% de distancia) en la sesión de hoy.";
    }

    const prompt = `
Eres un analista financiero experto. 
A continuación te proporciono una lista de 'gaps' (huecos de precios) en el mercado bursátil que aún no han sido cubiertos y que se encuentran a un 7% o menos de distancia del precio de cierre actual.

Datos:
${JSON.stringify(relevantGaps, null, 2)}

Por favor, redacta un resumen ejecutivo muy breve (máximo 3 párrafos cortos) pensado para ser enviado por WhatsApp a un inversor. 
Destaca únicamente los casos más críticos o interesantes (los que están más cerca de cubrirse o son de empresas muy relevantes).
No incluyas saludos largos, ve directo al grano.
    `;

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 300,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const data = await response.json();
        if (data.content && data.content.length > 0) {
            return data.content[0].text;
        }
        return "Resumen generado vacío o error en Claude.";
    } catch (e) {
        console.error("Error conectando con Claude:", e);
        return "Error al generar el resumen con IA.";
    }
}
