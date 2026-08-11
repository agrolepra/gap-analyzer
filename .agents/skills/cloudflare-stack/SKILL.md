---
name: Cloudflare Stack Development
description: Reglas para desarrollar y desplegar aplicaciones en Cloudflare Workers y Pages.
---

# Cloudflare Stack (Workers + Pages)

Al desarrollar el backend y frontend de este proyecto, sigue estas directrices para Cloudflare:

## Arquitectura Separada

- El Frontend y el Backend DEBEN vivir en directorios separados dentro del repositorio, o usar un monorepo claro (ej. `frontend/` y `worker/`).
- **Frontend (Cloudflare Pages):** Usa Vite o React. El build generará archivos estáticos.
- **Backend (Cloudflare Workers):** Usa Wrangler (la CLI de Cloudflare) para el desarrollo local y el despliegue.

## Cloudflare Workers (Backend)

1. **JavaScript Nativo:** Usa JavaScript (ES Modules). No uses dependencias pesadas de Node.js a menos que estés seguro de que son compatibles con el entorno de Workers.
2. **Variables de Entorno (Secrets):** 
   - En desarrollo, usa `.dev.vars` (nunca lo subas al repo).
   - En producción, usa `wrangler secret put`.
   - Las claves API (Twelve Data, OpenAI, Anthropic) deben pasarse siempre a través de `env`.
3. **Manejo de CORS:** El Worker DEBE incluir encabezados CORS (Cross-Origin Resource Sharing) en sus respuestas para que el Frontend (alojado en otro subdominio) pueda comunicarse sin errores.
4. **Cron Triggers:** Para las tareas programadas, define el schedule en el archivo `wrangler.toml` bajo `[triggers]`.

## Comunicación Frontend-Backend

- El Frontend debe usar la URL del Worker para hacer peticiones (`fetch`).
- En desarrollo local, el Worker suele correr en `http://localhost:8787` y Vite en `http://localhost:5173`. Asegúrate de manejar estas URLs relativas/absolutas correctamente.
