# Gap Analyzer - Deployment Guide

## Pre-deployment Checklist

### Frontend
- [ ] `npm run build` compila sin errores (482KB gzipped)
- [ ] Todos los componentes importan correctamente
- [ ] TypeScript type-checking pasa
- [ ] Oxlint linting pasa (`npm run lint`)
- [ ] Variables de entorno en `.env`

### Worker
- [ ] `wrangler deploy` está configurado
- [ ] Secrets configurados en Cloudflare (`wrangler secret put`)
- [ ] D1 Database vinculada (gap-analyzer-db)
- [ ] Schema SQL ejecutado en D1
- [ ] Cron triggers configurados (0 18 * * 1-5)

## Deployment a Cloudflare

### 1. Frontend (Cloudflare Pages)

```bash
cd frontend
npm install
npm run build

# Subir a Cloudflare Pages vía CLI
npm install -g wrangler
wrangler deploy --name gap-analyzer-frontend dist/
```

O manualmente:
1. Ir a https://pages.cloudflare.com
2. Conectar repositorio GitHub
3. Build command: `cd frontend && npm install && npm run build`
4. Build output directory: `frontend/dist`

### 2. Backend (Cloudflare Worker)

```bash
cd worker

# 1. Authenticate
wrangler login

# 2. Update wrangler.jsonc con tus valores
# - account_id: tu Account ID de Cloudflare
# - database_id: tu D1 Database ID
# - database_name: nombre de tu BD

# 3. Crear/migrar D1 Database
wrangler d1 create gap-analyzer-db
wrangler d1 execute gap-analyzer-db --file=schema.sql

# 4. Configurar secrets
wrangler secret put TWELVEDATA_API_KEY
# Pega tu key y presiona Ctrl+D

wrangler secret put ANTHROPIC_API_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put APP_USERNAME
wrangler secret put APP_PASSWORD
wrangler secret put TICKERS
wrangler secret put RESEND_API_KEY
wrangler secret put EMAIL_TO
wrangler secret put WHATSAPP_API_KEY
wrangler secret put WHATSAPP_PHONE

# 5. Deploy
npm run deploy
# O: wrangler deploy
```

### 3. DNS Configuration

En Cloudflare DNS, apunta:
```
gap-analyzer-web       CNAME → tu-username.pages.dev
gap-analyzer-api       CNAME → tu-username.workers.dev
```

O usa rutas personalizadas:
```
https://gap-analyzer.xerebrumgroup.com  → Pages
https://api.gap-analyzer.xerebrumgroup.com → Worker
```

## Database Setup

### Crear D1 Database

```bash
# Vía Cloudflare CLI
wrangler d1 create gap-analyzer-db

# Obtener Database ID
wrangler d1 list

# Ejecutar schema
wrangler d1 execute gap-analyzer-db --file=worker/schema.sql
```

### Verificar tablas creadas

```bash
wrangler d1 execute gap-analyzer-db --command \
  "SELECT name FROM sqlite_master WHERE type='table';"

# Salida esperada:
# daily_prices
# gaps_history
# user_sessions
# audit_logs
```

## Environment Variables

### Frontend (.env)

```
VITE_API_URL=https://gap-analyzer-api.xerebrumgroup.com
VITE_WORKER_URL=https://gap-analyzer-worker.agrolepra.workers.dev
```

### Worker (wrangler.jsonc)

```jsonc
{
  "account_id": "tu_account_id",
  "database_id": "tu_database_id",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "gap-analyzer-db",
      "database_id": "tu_id"
    }
  ]
}
```

Secrets (via CLI):
```bash
wrangler secret put APP_USERNAME       # admin
wrangler secret put APP_PASSWORD       # tu_password
wrangler secret put TWELVEDATA_API_KEY # xxxxx
wrangler secret put ANTHROPIC_API_KEY  # sk-proj-xxxxx
wrangler secret put OPENAI_API_KEY     # sk-xxxxx
wrangler secret put TICKERS            # AAPL,MSFT,TSLA
wrangler secret put RESEND_API_KEY     # re_xxxxx
wrangler secret put EMAIL_TO           # tu@email.com
wrangler secret put WHATSAPP_API_KEY   # xxxxx
wrangler secret put WHATSAPP_PHONE     # +34666000000
```

## Monitoring & Logs

### Cloudflare Workers Analytics

1. Dashboard → Workers → gap-analyzer-worker
2. Ver requests, errors, latency
3. Logs en tiempo real: `wrangler tail`

### D1 Queries de diagnóstico

```bash
# Contar gaps detectados
wrangler d1 execute gap-analyzer-db --command \
  "SELECT COUNT(*) as total_gaps FROM gaps_history;"

# Últimos 10 gaps
wrangler d1 execute gap-analyzer-db --command \
  "SELECT * FROM gaps_history ORDER BY analysis_date DESC LIMIT 10;"

# Sesiones activas
wrangler d1 execute gap-analyzer-db --command \
  "SELECT COUNT(*) as active_sessions FROM user_sessions;"

# Auditoría
wrangler d1 execute gap-analyzer-db --command \
  "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 20;"
```

## Performance Tuning

### Frontend (Vite)

```bash
# Analizar bundle
npm run build -- --analyze

# Optimizaciones:
# - Code splitting automático
# - Tree shaking incluido
# - Minificación con Rollup
# - Gzipping en Cloudflare Pages
```

### Worker

1. **Caché de precios**:
   - Implementar Cloudflare Cache API
   - TTL de 1 hora para datos diarios

2. **Batch requests**:
   - Máx 8 símbolos por request (Twelve Data)
   - Delay de 12s entre batches (respeta 8 req/min)

3. **Database indexes**:
   - Agregar índices a `gaps_history(ticker, analysis_date)`
   - Agregar índices a `daily_prices(ticker, date)`

## Rollback Plan

Si hay problema en producción:

```bash
# Ver histórico de deployments
wrangler deployments list

# Rollback a versión anterior
wrangler rollback --version <VERSION_ID>

# Frontend (Cloudflare Pages)
# En Pages → Deployments → desplegar revisión anterior
```

## Cost Estimation

### Cloudflare Pricing

| Servicio | Límite Gratuito | Costo |
|----------|-----------------|-------|
| Workers | 100k req/día | $0.50 / M req |
| D1 Database | 5 GB storage | $0.75 / GB/mes |
| Pages | Ilimitado | Gratis |
| Cron Triggers | Ilimitados | Incluido |

### Twelve Data Pricing

| Plan | Límite | Costo |
|------|--------|-------|
| Free | 800 req/día | Gratis |
| Starter | 60k req/mes | $9.99 |
| Professional | 500k req/mes | $49.99 |

## Escalabilidad

### Si crece el uso:

1. **Upgrade Twelve Data** si necesitas más símbolos/frecuencia
2. **Implementar caché Redis** para precios frecuentes
3. **Agregar Queue** (Cloudflare Queues) para análisis batch
4. **Implementar webhooks** para notificaciones real-time
5. **Multi-región** con Cloudflare global network

## Support & Issues

### Logs de debugging

```bash
# Ver logs del worker en tiempo real
wrangler tail --format pretty

# Ver logs de errores específicos
wrangler d1 execute gap-analyzer-db --command \
  "SELECT * FROM audit_logs WHERE action LIKE '%Error%';"
```

### Common Issues

| Problema | Solución |
|----------|----------|
| "401 Unauthorized" | Token expirado, reinicia sesión |
| "Gap Analyzer API not found" | Verifica URL del worker |
| "Database connection error" | Verifica ID de D1 en wrangler.jsonc |
| "No data from Twelve Data" | Verifica API key y plan gratuito |

## Mantenimiento

### Backup de datos

```bash
# Exportar gaps históricos
wrangler d1 execute gap-analyzer-db --command \
  "SELECT * FROM gaps_history" > gaps_backup.csv

# Exportar precios
wrangler d1 execute gap-analyzer-db --command \
  "SELECT * FROM daily_prices" > prices_backup.csv
```

### Limpieza periódica

```sql
-- Borrar datos antiguos (> 1 año)
DELETE FROM gaps_history 
WHERE analysis_date < datetime('now', '-1 year');

DELETE FROM daily_prices 
WHERE date < datetime('now', '-1 year');
```

---

**Última actualización**: 2026-08-13
**Status**: ✅ Ready for Production
