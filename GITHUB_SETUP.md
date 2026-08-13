# GitHub + Cloudflare Auto-Deploy Setup

Guía completa para conectar GitHub con Cloudflare y hacer auto-deploy automático.

## 🔧 Paso 1: Crear Repositorio en GitHub

```bash
# Inicializar si no existe
git init
git remote add origin https://github.com/tu-usuario/gap-analyzer.git

# Cambiar rama principal a main
git branch -M main

# Hacer primer push
git add .
git commit -m "Initial commit: Gap Analyzer Platform"
git push -u origin main
```

## 🔑 Paso 2: Obtener Tokens de Cloudflare

### 2a. Cloudflare API Token

1. Ir a: https://dash.cloudflare.com/profile/api-tokens
2. Click en "Create Token"
3. Usar template: **"Edit Cloudflare Workers"**
4. Permisos necesarios:
   - `Account.Cloudflare Workers Scripts:Edit`
   - `Account.Pages:Edit`
   - `Account.D1:Edit`
5. Copiar el token (lo usarás en GitHub)

### 2b. Obtener Account ID

```bash
# En terminal local
npx wrangler whoami

# O en: https://dash.cloudflare.com/
# Copia tu Account ID (visible arriba a la derecha)
```

Guarda estos valores:
- `CLOUDFLARE_API_TOKEN` = tu API token
- `CLOUDFLARE_ACCOUNT_ID` = tu account ID (ej: 4332c80d60c65b8191fa453f3bb0ee74)

## 🔐 Paso 3: Configurar GitHub Secrets

1. Ve a tu repo en GitHub: https://github.com/tu-usuario/gap-analyzer
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"

Agregar estos secrets:

| Nombre | Valor | Origen |
|--------|-------|--------|
| `CLOUDFLARE_API_TOKEN` | tu_api_token | Cloudflare Dashboard |
| `CLOUDFLARE_ACCOUNT_ID` | 4332c80... | `npx wrangler whoami` |
| `VITE_API_URL` | https://gap-analyzer-api.xerebrumgroup.com | Tu dominio |
| `TWELVEDATA_API_KEY` | tu_api_key | twelvedata.com |
| `ANTHROPIC_API_KEY` | sk-proj-... | console.anthropic.com |
| `OPENAI_API_KEY` | sk-... | platform.openai.com |
| `APP_USERNAME` | admin | Tu preferencia |
| `APP_PASSWORD` | changeme | Tu preferencia |
| `TICKERS` | AAPL,MSFT,TSLA | Tu preferencia |

### Cómo agregar un secret en GitHub:

```
1. Nombre: CLOUDFLARE_API_TOKEN
2. Value: [pega tu token]
3. Click "Add secret"
```

Repetir para cada uno.

## 📝 Paso 4: Configurar wrangler.jsonc

El archivo `worker/wrangler.jsonc` debe tener tu Account ID:

```jsonc
{
  "account_id": "4332c80d60c65b8191fa453f3bb0ee74",
  "name": "gap-analyzer-worker",
  "main": "src/index.js",
  "compatibility_date": "2026-08-10",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "gap-analyzer-db",
      "database_id": "6dc3cf62-fbf8-4a10-82b9-4be8c5a0422e"
    }
  ]
}
```

> Nota: Reemplaza `account_id` y `database_id` con tus valores

## 🚀 Paso 5: Configurar Cloudflare Pages (Manual - una sola vez)

1. Ve a: https://pages.cloudflare.com
2. "Create a project" → Connect to Git
3. Selecciona tu repo `gap-analyzer`
4. Configurar:
   - **Production branch**: main
   - **Build command**: `cd frontend && npm install && npm run build`
   - **Build output directory**: `frontend/dist`
5. Click "Save and Deploy"

> Después de esto, GitHub Actions manejará los deploys automáticos

## 🔄 Paso 6: Configurar Auto-Deploy

El archivo `.github/workflows/deploy.yml` ya está configurado. Solo necesitas:

1. Push a GitHub:
```bash
git add .github/
git commit -m "ci: Add GitHub Actions workflows"
git push origin main
```

2. Ve a tu repo → Actions
3. Verifica que el workflow `Deploy to Cloudflare` se ejecute
4. Mira los logs para verificar que todo funciona

## 📊 Flujo Resultante

```
Tu código local
       ↓
    git push
       ↓
   GitHub Repo
       ↓
GitHub Actions (auto-deploy.yml)
    ↙          ↘
Frontend      Worker
    ↓            ↓
Cloudflare    Cloudflare
Pages         Workers
    ↓            ↓
   ✓ Live       ✓ Live
```

## 🧪 Test del Workflow

Para verificar que todo funciona:

```bash
# 1. Hacer un cambio pequeño
echo "// test" >> frontend/src/App.tsx

# 2. Commit y push
git add frontend/src/App.tsx
git commit -m "test: trigger workflow"
git push origin main

# 3. Ver en GitHub
# Ve a tu repo → Actions
# Deberías ver el workflow ejecutándose
```

## 🐛 Troubleshooting

### ❌ Workflow falla: "API token invalid"

**Solución:**
```bash
# Regenerar token en Cloudflare
# 1. https://dash.cloudflare.com/profile/api-tokens
# 2. Crear nuevo token
# 3. Actualizar en GitHub: Settings → Secrets
```

### ❌ "Account ID not found"

**Solución:**
```bash
# Verificar account ID
npx wrangler whoami

# Actualizar en wrangler.jsonc y GitHub Secrets
```

### ❌ Worker deploy falla: "Database binding not found"

**Solución:**
```bash
# Verificar que D1 database existe
wrangler d1 list

# Si no existe, crearla:
wrangler d1 create gap-analyzer-db

# Ejecutar schema
wrangler d1 execute gap-analyzer-db --file=worker/schema.sql
```

### ❌ Pages deploy falla: "Project not found"

**Solución:**
1. Verificar que el proyecto existe en Cloudflare Pages
2. Usar el nombre exacto en `.github/workflows/deploy.yml`
3. Verificar que CLOUDFLARE_ACCOUNT_ID es correcto

## 📋 Checklist Final

- [ ] Repository creado en GitHub
- [ ] Cloudflare API Token generado
- [ ] Cloudflare Account ID obtenido
- [ ] Todos los secrets agregados a GitHub
- [ ] `wrangler.jsonc` actualizado con Account ID
- [ ] `worker/schema.sql` ejecutado en D1
- [ ] `.github/workflows/deploy.yml` pusheado
- [ ] Cloudflare Pages proyecto creado
- [ ] Primer workflow ejecutado exitosamente
- [ ] Verificar que frontend y worker están en vivo

## 🔗 Comandos Útiles

```bash
# Ver status del workflow
gh workflow view deploy.yml

# Ver logs del último workflow
gh run list
gh run view <RUN_ID> --log

# Rerun workflow si falló
gh run rerun <RUN_ID>

# Ver secrets (no muestra valores)
gh secret list

# Actualizar un secret
gh secret set CLOUDFLARE_API_TOKEN < token.txt
```

## 🌐 URLs Finales

Después de completar todo:

```
Frontend: https://gap-analyzer-frontend.pages.dev
           (o tu dominio personalizado)

Worker: https://gap-analyzer-worker.your-account.workers.dev
        (o tu dominio personalizado)

GitHub: https://github.com/tu-usuario/gap-analyzer

Dashboard: https://dash.cloudflare.com/
```

## 🎯 Próximos Pasos

Con auto-deploy configurado, ahora:

1. **Desarrollo local normal:**
   ```bash
   git checkout -b feature/nueva-feature
   # ... hacer cambios ...
   git commit -m "feat: nueva feature"
   git push origin feature/nueva-feature
   ```

2. **Pull Request:**
   - GitHub Actions corre lint/tests
   - Revisar cambios
   - Merge a `main` o `develop`

3. **Auto-Deploy automático:**
   - Push a `main` → Deploy a producción
   - Push a `develop` → Deploy a staging

## 💡 Tips

- **Proteger main branch:** Settings → Branches → Add rule
  - Require PR reviews
  - Require status checks to pass
  
- **Ver deployment status:** Deploy → Environments

- **Rollback rápido:** Si algo falla, revertir commit y push:
  ```bash
  git revert <commit_id>
  git push origin main
  ```

---

**Status:** ✅ Auto-deploy Configurado
**Última actualización:** 2026-08-13
