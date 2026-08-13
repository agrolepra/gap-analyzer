export async function generateSummary(gaps, openAiKey) {
    if (!openAiKey) {
        return null;
    }

    const prompt = `Sos un analista financiero experto en trading técnico. Analiza los siguientes gaps de precios (espacios en blanco en el gráfico que aún no se han cubierto) y redactá un resumen conciso, directo y profesional para un trader.

Para cada gap destacado indicá: ticker, tipo (alcista/bajista), distancia actual al gap y si es una oportunidad relevante.

Datos de Gaps encontrados:
${JSON.stringify(gaps.slice(0, 15), null, 2)}

Respondé en español, en 3-5 párrafos como máximo. Empezá con el panorama general y terminá con recomendaciones de seguimiento.`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openAiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                max_tokens: 1024,
                messages: [
                    { role: 'user', content: prompt }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error from OpenAI API:", errorText);
            return null;
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
    } catch (e) {
        console.error("Exception generating AI summary:", e);
        return null;
    }
}