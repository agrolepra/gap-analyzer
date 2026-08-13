# 🔗 Cloudflare Pages - GitHub Auto-Deploy Setup

## ✅ Ya Configurado

- ✓ Repositorio GitHub creado: https://github.com/JosioG/gap-analyzer
- ✓ Código pusheado a main
- ✓ GitHub Secrets agregados (9 secrets)
- ✓ GitHub Actions workflow listo (.github/workflows/deploy.yml)
- ✓ Cloudflare Worker en vivo: https://gap-analyzer-ivan.pages.dev/
- ✓ Token de Cloudflare configurado

## 🔧 Falta Conectar: Cloudflare Pages

Para que el auto-deploy funcione, necesitas conectar Cloudflare Pages con GitHub.

### Opción A: Si ya existe proyecto "gap-analyzer-frontend" en Pages

1. Ve a: https://dash.cloudflare.com/
2. Pages → gap-analyzer-frontend
3. Settings → Git
4. Reconectar repositorio:
   - Repository: `JosioG/gap-analyzer`
   - Production branch: `main`
   - Build command: `cd frontend && npm install && npm run build`
   - Build output: `frontend/dist`
   - Environment variables:
     - `VITE_API_URL` = `https://gap-analyzer-ivan-api.agrolepra.workers.dev`

### Opción B: Si NO existe proyecto en Pages (Crear nuevo)

1. Ve a: https://pages.cloudflare.com
2. Create project → Connect to Git
3. Autorizar GitHub
4. Seleccionar repositorio: `JosioG/gap-analyzer`
5. Configurar build:
   ```
   Project name: gap-analyzer-frontend
   Production branch: main
   Build command: cd frontend && npm install && npm run build
   Build output directory: frontend/dist
   ```
6. Environment variables:
   ```
   VITE_API_URL = https://gap-analyzer-ivan-api.agrolepra.workers.dev
   ```
7. Deploy project

## 📊 Estado Actual

```
✓ Local Repository (git)
       ↓
✓ GitHub Repository (JosioG/gap-analyzer)
       ↓
✓ GitHub Actions (workflow listo)
       ↓
⏳ Cloudflare Pages (FALTA CONECTAR)
       ↓
✓ Cloudflare Worker (gap-analyzer-ivan.pages.dev)
```

## 🚀 Después de Conectar Pages

Automáticamente cada vez que hagas:

```bash
git push origin main
```

1. GitHub Actions se ejecuta
2. Frontend compila y deploya a Pages
3. Worker deploya (si hay cambios)
4. Todo en vivo en ~2-3 minutos

## 🔑 Secrets en GitHub

Actualizar con valores REALES (actualmente son placeholders):

```bash
# Ir a: https://github.com/JosioG/gap-analyzer/settings/secrets/actions

TWELVEDATA_API_KEY      # Tu API key de twelvedata.com
ANTHROPIC_API_KEY       # Tu API key de Anthropic (sk-proj-...)
OPENAI_API_KEY          # Tu API key de OpenAI (sk-...)
APP_PASSWORD            # Tu contraseña segura
```

Comando para actualizar:

```bash
# Actualizar individual
gh secret set TWELVEDATA_API_KEY < /dev/stdin

# O editar en GitHub
# https://github.com/JosioG/gap-analyzer/settings/secrets/actions
```

## 📋 Checklist Final

- [ ] Ingresar a Cloudflare Dashboard
- [ ] Conectar repositorio GitHub a Pages
- [ ] Verificar que Pages esté configurado
- [ ] Hacer un test: git push a main
- [ ] Ver GitHub Actions ejecutarse
- [ ] Verificar Pages deployment
- [ ] Actualizar secrets REALES en GitHub

## 🎯 URLs Finales

```
Frontend (Pages):    https://gap-analyzer-frontend.pages.dev
Worker (API):        https://gap-analyzer-ivan.pages.dev
Dashboard:           https://dash.cloudflare.com/
GitHub:              https://github.com/JosioG/gap-analyzer
GitHub Actions:      https://github.com/JosioG/gap-analyzer/actions
```

## 🐛 Troubleshooting

**❌ "Deployment failed"**
- Ver logs en Pages dashboard
- Revisar que build command esté correcto

**❌ "Git repository not found"**
- Verificar que el token de GitHub tenga permisos

**❌ "Frontend en blanco"**
- Verificar VITE_API_URL esté correcta
- Ver console del navegador para errores

## 📞 Siguiente Paso

**Solo necesitas hacer esto UNA VEZ en Cloudflare:**
1. Ve a https://pages.cloudflare.com
2. Conecta repositorio `JosioG/gap-analyzer`
3. ¡Listo! Desde ahí es automático

---

**Status:** ⏳ A la espera de conectar Cloudflare Pages
**Repositorio:** https://github.com/JosioG/gap-analyzer
**Última actualización:** 2026-08-13
