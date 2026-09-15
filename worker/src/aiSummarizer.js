// deepseek/deepseek-r1:free fue retirado del catálogo de OpenRouter (confirmado
// el 2026-09-15, dejó de aparecer en openrouter.ai/api/v1/models). Se usa un
// modelo pago barato y confiable como default — el mismo que ya está activo en
// producción vía app_settings.ai_model — para no volver a depender de un
// modelo gratis que puede desaparecer del catálogo sin aviso.
export const DEFAULT_AI_MODEL = 'openai/gpt-4o-mini';

export async function generateSummary(gaps, openrouterKey, model) {
    if (!openrouterKey) {
        return null;
    }

    const prompt = `Sos un analista financiero experto en trading técnico. Analiza los siguientes gaps de precios (espacios en blanco en el gráfico que aún no se han cubierto) y redactá un resumen conciso, directo y profesional para un trader.

Para cada gap destacado indicá: ticker, tipo (alcista/bajista), distancia actual al gap y si es una oportunidad relevante.

Datos de Gaps encontrados:
${JSON.stringify(gaps.slice(0, 15), null, 2)}

Respondé en español, en 3-5 párrafos como máximo. Empezá con el panorama general y terminá con recomendaciones de seguimiento.`;

    try {
        const response = await fetch(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openrouterKey}`,
                },
                body: JSON.stringify({
                    model: model || DEFAULT_AI_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    // Generoso a propósito: modelos de razonamiento (R1 y similares)
                    // gastan tokens en una cadena de pensamiento interna antes de la
                    // respuesta final — con un límite chico, esa respuesta queda
                    // cortada (o directamente no llega a generarse). Un modelo sin
                    // razonamiento simplemente no llega a usarlos todos.
                    max_tokens: 8000,
                }),
                // Generoso a propósito: un modelo de razonamiento (sobre todo una
                // variante :free, compartida entre todos los usuarios gratuitos de
                // OpenRouter) puede tardar bastante más que una llamada normal. Esto
                // corre desacoplado vía ctx.waitUntil() en los caminos automáticos,
                // así que un timeout largo acá no frena el resto del cron.
                signal: AbortSignal.timeout(90000),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error from OpenRouter API:", errorText);
            return null;
        }

        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || null;
        // Algunos proveedores de R1 vía OpenRouter devuelven la cadena de
        // razonamiento inline dentro del mismo content, envuelta en <think>...</think>
        // — se descarta esa parte y se queda solo con la respuesta final.
        if (text) {
            text = text.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
        }
        return text || null;
    } catch (e) {
        console.error("Exception generating AI summary:", e);
        return null;
    }
}
