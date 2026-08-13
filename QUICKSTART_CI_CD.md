# 🚀 Quick Start: Git → GitHub → Cloudflare Auto-Deploy

Configuración automática en **5 minutos**.

## 📋 Requisitos

- [x] GitHub CLI (`gh`) - Instala: https://cli.github.com/
- [x] Wrangler CLI (`npx wrangler`) - Ya incluido en worker/
- [x] Cloudflare Account - Crea en https://dash.cloudflare.com/
- [x] Código local con git inicializado

## ⚡ Setup Automático (Recomendado)

```bash
# 1. Ejecutar script de setup
bash scripts/setup-github.sh

# El script te pedirá:
# - Account ID de Cloudflare
# - API Token de Cloudflare
# - GitHub credentials
# - API keys (Twelve Data, OpenAI, etc.)

# Automáticamente hará:
# ✓ Actualizar wrangler.jsonc
# ✓ Crear repository en GitHub
# ✓ Agregar secrets
# ✓ Push a GitHub
# ✓ Activar workflows
```

## 🔧 Setup Manual (Paso a Paso)

### 1️⃣ Obtener Tokens de Cloudflare

```bash
# A. Account ID
npx wrangler whoami

# B. API Token (crear en dashboard)
# 1. Ve a: https://dash.cloudflare.com/profile/api-tokens
# 2. Create Token → Usar template "Edit Cloudflare Workers"
# 3. Copiar token
```

### 2️⃣ Crear Repositorio en GitHub

```bash
# Opción A: Si es nuevo repo
gh repo create gap-analyzer --source=. --remote=origin --push

# Opción B: Si ya existe
git remote add origin https://github.com/tu-usuario/gap-analyzer.git
git branch -M main
git push -u origin main
```

### 3️⃣ Agregar Secrets a GitHub

```bash
# Usar gh CLI (más fácil)
gh secret set CLOUDFLARE_API_TOKEN < token.txt
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set TWELVEDATA_API_KEY
gh secret set ANTHROPIC_API_KEY
gh secret set APP_USERNAME
gh secret set APP_PASSWORD
gh secret set TICKERS
gh secret set VITE_API_URL
```

O manualmente en GitHub:
1. Settings → Secrets and variables → Actions
2. New repository secret
3. Agregar cada uno:

| Nombre | Valor |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Tu API token |
| `CLOUDFLARE_ACCOUNT_ID` | Tu account ID |
| `TWELVEDATA_API_KEY` | API key |
| `ANTHROPIC_API_KEY` | sk-proj-... |
| `OPENAI_API_KEY` | sk-... |
| `APP_USERNAME` | admin |
| `APP_PASSWORD` | tu_password |
| `TICKERS` | AAPL,MSFT,TSLA |
| `VITE_API_URL` | https://gap-analyzer-api.xerebrumgroup.com |

### 4️⃣ Actualizar wrangler.jsonc

```jsonc
{
  "account_id": "TU_ACCOUNT_ID_AQUI",  // ← Actualizar
  "name": "gap-analyzer-worker",
  "main": "src/index.js",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "gap-analyzer-db",
      "database_id": "TU_DATABASE_ID_AQUI"  // ← Mantener
    }
  ]
}
```

### 5️⃣ Crear Proyecto en Cloudflare Pages (Una sola vez)

1. Ve a: https://pages.cloudflare.com
2. Create project → Connect to Git
3. Selecciona tu repositorio
4. Configura:
   ```
   Build command: cd frontend && npm install && npm run build
   Build output directory: frontend/dist
   Environment variables: VITE_API_URL = https://gap-analyzer-api.xerebrumgroup.com
   ```
5. Deploy

### 6️⃣ Push y Listo

```bash
# El workflow se ejecutará automáticamente
git add .github/ scripts/ GITHUB_SETUP.md QUICKSTART_CI_CD.md
git commit -m "ci: Configure auto-deploy"
git push origin main

# Ver en GitHub Actions
open https://github.com/tu-usuario/gap-analyzer/actions
```

## 🔄 Flujo Resultante

```
Local Changes
      ↓
  git commit
      ↓
  git push origin main
      ↓
  GitHub Push Event
      ↓
GitHub Actions (deploy.yml)
    ↙     ↘      ↘
Lint  Frontend  Worker
  ↓      ↓       ↓
 ✓    Pages    Workers
  ↓      ↓       ↓
      ✅ Live Production
```

## ✨ Casos de Uso

### 📝 Desarrollar una nueva feature

```bash
# 1. Crear rama
git checkout -b feature/nueva-feature

# 2. Hacer cambios y commit
git add .
git commit -m "feat: agregar nueva feature"

# 3. Push
git push origin feature/nueva-feature

# 4. Abrir PR en GitHub
gh pr create --fill

# GitHub Actions ejecuta lint/tests en el PR
# Después de review, merge a main
# → Auto-deploy a producción
```

### 🐛 Fix urgente a producción

```bash
# 1. Crear rama de hotfix
git checkout -b hotfix/critical-bug

# 2. Fix el bug
git add .
git commit -m "fix: critical bug en dashboard"

# 3. Push directo a main (fast-track)
git push origin hotfix/critical-bug
gh pr create --title "🔥 Critical: Bug fix" --body "" 
# → Merge y deploy automático
```

### 🎯 Deployment a staging (develop branch)

```bash
# Push a develop branch (sin cambiar main)
git push origin feature/test:develop

# El workflow se ejecuta en staging
# URL: gap-analyzer-staging.pages.dev
```

## 🚨 Troubleshooting

### ❌ Workflow falla: "API Token expired"

```bash
# Regenerar token
# 1. https://dash.cloudflare.com/profile/api-tokens
# 2. Copiar nuevo token
# 3. gh secret set CLOUDFLARE_API_TOKEN < token.txt
```

### ❌ "Database binding not found"

```bash
# Verificar D1 database
wrangler d1 list

# Si no existe, crear:
wrangler d1 create gap-analyzer-db

# Ejecutar schema
wrangler d1 execute gap-analyzer-db --file=worker/schema.sql

# Actualizar database_id en wrangler.jsonc
```

### ❌ Frontend build falla

```bash
# Ver logs en GitHub Actions
# 1. Actions tab
# 2. Click en último run
# 3. Click en "Deploy Frontend"
# 4. Ver el error

# Probablemente es un error de build
# npm run build localmente para debuggear
```

### ❌ Pages Project "not found"

```bash
# Crear proyecto manualmente en Pages
# https://pages.cloudflare.com

# El workflow automático fallará si no existe
# Pero solo necesitas crearla una sola vez
```

## 📊 Monitorear Deployments

### GitHub Actions

```bash
# Ver workflow status
gh run list

# Ver logs detallados
gh run view <RUN_ID> --log

# Rerun si falló
gh run rerun <RUN_ID>
```

### Cloudflare Dashboard

- **Deployments**: https://dash.cloudflare.com/
  - Pages → gap-analyzer-frontend
  - Workers → gap-analyzer-worker

### Comandos útiles

```bash
# Ver si worker está en vivo
curl https://gap-analyzer-worker.your-account.workers.dev/

# Ver si frontend está en vivo
curl https://gap-analyzer-frontend.pages.dev

# Logs del worker
wrangler tail gap-analyzer-worker
```

## 🎯 Arquitectura Final

```
┌─────────────────────────────────────┐
│   Tu Computadora (Local)            │
│   git init, git push, git pull      │
└────────────────┬────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────┐
│   GitHub Repository                 │
│   .github/workflows/deploy.yml       │
│   (CI/CD Pipeline)                  │
└────────────────┬────────────────────┘
           ┌─────┴─────┐
           ↓           ↓
      ┌────────┐   ┌─────────┐
      │  Test  │   │  Build  │
      └────────┘   └─────────┘
           │           │
           └─────┬─────┘
                 ↓
      ┌──────────┴──────────┐
      ↓                     ↓
  ┌────────────┐    ┌──────────────┐
  │Cloudflare  │    │Cloudflare    │
  │Pages       │    │Workers       │
  │(Frontend)  │    │(API)         │
  └────────────┘    └──────────────┘
      ↓                     ↓
  https://gap-            https://gap-
  analyzer-               analyzer-
  frontend.               worker.
  pages.dev               workers.dev
```

## 💡 Tips Pro

1. **Proteger main branch:**
   ```
   Settings → Branches → Add rule
   - Main
   - Require PR reviews (2)
   - Require status checks to pass
   ```

2. **Auto-fixes con husky:**
   ```bash
   npm install husky
   npx husky install
   ```

3. **Versionado automático:**
   ```bash
   npm install -D semantic-release
   # Genera versiones automáticas basado en commits
   ```

4. **Notificaciones:**
   - Discord webhook en GitHub
   - Slack integration
   - Email notifications

## 📚 Documentación Completa

- **GITHUB_SETUP.md** - Guía detallada
- **DEPLOYMENT.md** - Deployment manual
- **README.md** - Overview del proyecto

## 🎉 ¡Listo!

Después del setup:

```bash
# Desarrollo normal
git checkout -b feature/xyz
# ... haz cambios ...
git commit -m "feat: xyz"
git push origin feature/xyz

# GitHub Actions automáticamente:
# ✓ Corre lint
# ✓ Corre tests
# ✓ Compila frontend
# ✓ Deploy a Pages si todo OK
# ✓ Deploy a Workers si todo OK

# Todo en vivo en ~2-3 minutos
```

---

**Status:** ✅ Auto-Deploy Listo
**Tiempo de Setup:** 5 minutos
**Overhead:** Ninguno (código igual)
