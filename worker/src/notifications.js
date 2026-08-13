export async function sendEmail(content, env) {
    if (!env.RESEND_API_KEY || !env.EMAIL_TO) {
        console.log("Email no configurado (Falta RESEND_API_KEY o EMAIL_TO)");
        return;
    }

    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'GapAnalyzer <onboarding@resend.dev>',
                to: [env.EMAIL_TO],
                subject: 'Reporte Diario de Gaps 📈',
                html: `<p>Aquí tienes el resumen diario del mercado:</p><br><p>${content.replace(/\n/g, '<br>')}</p>`
            })
        });
        console.log("Email enviado con éxito.");
    } catch (e) {
        console.error("Error enviando Email:", e);
    }
}

export async function sendWhatsApp(content, env) {
    if (!env.WHATSAPP_PHONE || !env.WHATSAPP_API_KEY) {
        console.log("WhatsApp no configurado (Falta WHATSAPP_PHONE o API_KEY)");
        return;
    }

    try {
        const url = `https://api.callmebot.com/whatsapp.php?phone=${env.WHATSAPP_PHONE}&text=${encodeURIComponent(content)}&apikey=${env.WHATSAPP_API_KEY}`;
        await fetch(url, { method: 'GET' });
        console.log("WhatsApp enviado con éxito.");
    } catch (e) {
        console.error("Error enviando WhatsApp:", e);
    }
}