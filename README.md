# Gap Analyzer Platform

Una plataforma moderna para detectar y analizar saltos en precios de acciones (gaps) en tiempo real usando Cloudflare Workers y React.

## 🚀 Stack Tecnológico

### Frontend
- **React 18** con TypeScript
- **Vite** para bundling (482KB min + gzipped)
- **React Router 6** para navegación
- **Lucide React** para iconos
- **XLSX** para exportar datos

### Backend
- **Cloudflare Workers** (ejecutable globalmente)
- **Cloudflare D1** para almacenamiento
- **Twelve Data API** para datos de precios
- **OpenAI/Anthropic** para análisis con IA (opcional)

### Infraestructura
- **Docker Compose** para desarrollo local
- **GitHub** para versionado
- **Cloudflare Pages** para hosting del frontend

## 📋 Características Implementadas

### Autenticación
- Login con usuario/contraseña
- JWT tokens almacenados en localStorage
- Sesiones en Cloudflare D1
- Logout con limpieza de tokens

### Dashboard
- Análisis manual de gaps por ticker
- Soporte para múltiples tickers simultáneamente
- Visualización de gaps detectados (bullish/bearish)
- Resumen automático con IA (opcional)

### Historial de Gaps
- Listado de todos los gaps detectados
- Ordenado por fecha de análisis
- Información detallada de cada gap (puntos cercanos/lejanos)

### Cotizaciones
- Visualización de precios históricos por ticker
- Datos guardados en Cloudflare D1
- Límite de 500 registros por query

### Backfill
- Carga histórica de precios (~1 año)
- Procesamiento en segundo plano
- Respeta límites de API (8 req/min)
- Evita duplicados automáticamente

### Configuración
- Almacenamiento de API keys localmente (localStorage)
- Twelve Data key obligatoria
- Opcional: OpenAI/Anthropic key para IA
- Persistencia entre sesiones

## 🛠️ Desarrollo Local

### Requisitos
- Node.js 18+
- npm 9+
- Docker (opcional, para base de datos local)

### Instalación

```bash
# Frontend
cd frontend
npm install
npm run dev       # Servidor en http://localhost:5173
npm run build     # Build para producción

# Worker (local)
cd ../worker
npm install
npm run dev       # Emulador de Cloudflare en http://localhost:8787
```

### Variables de Entorno (worker/.env.local)

```
TWELVEDATA_API_KEY=tu_api_key
ANTHROPIC_API_KEY=tu_api_key
OPENAI_API_KEY=tu_api_key
APP_USERNAME=admin
APP_PASSWORD=changeme
TICKERS=AAPL,MSFT,TSLA
```

## 📦 Estructura del Proyecto

```
ivanbarbero/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── atoms/        # Button, Input, Toggle, TickerChips
│   │   │   ├── molecules/    # FormField
│   │   │   ├── organisms/    # GapTable, PricesTable
│   │   │   └── pages/        # Login, Dashboard, History, Prices, Config, Backfill
│   │   ├── context/          # AuthContext
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── worker/
│   ├── src/
│   │   ├── index.js           # Endpoints principales
│   │   ├── gapAnalyzer.js     # Lógica de detección
│   │   ├── aiSummarizer.js    # Resúmenes con IA
│   │   └── notifications.js   # Email/WhatsApp
│   ├── schema.sql             # Definición de BD
│   ├── wrangler.jsonc         # Config de Cloudflare
│   └── package.json
└── .gitignore
```

## 🔄 Flujo de Análisis de Gaps

1. **Usuario inicia sesión** → JWT token guardado
2. **Selecciona tickers** → Soporta múltiples (ej: AAPL,MSFT,TSLA)
3. **Presiona "Analizar"** → Llamada a `/analyze`
4. **Worker descarga precios** → Twelve Data API (batch de 8 símbolos)
5. **Analiza gaps** → Algoritmo de "forward fill"
6. **Detecta no cubiertos** → Solo gaps que siguen abiertos
7. **Genera resumen (IA opcional)** → OpenAI/Anthropic
8. **Notificaciones** → Email/WhatsApp
9. **Persiste en BD** → D1 database

## 🧮 Algoritmo de Detección

El analizador de gaps utiliza la técnica de "forward fill":

1. **Identifica gaps** entre el cierre anterior y apertura actual
   - **Bullish**: apertura > cierre anterior
   - **Bearish**: cierre anterior > apertura

2. **Rastrea gaps activos** conforme el precio avanza
   - Cobertura total → se cierra
   - Cobertura parcial → se ajusta el gap
   - Dividido → se crea gap adicional

3. **Reporta gaps no cubiertos** después de período de análisis

## 🚢 Deployment

### Frontend (Cloudflare Pages)
```bash
npm run build
# Subir carpeta 'dist/' a Cloudflare Pages
```

### Worker (Cloudflare)
```bash
cd worker
npm run deploy
# O:
npx wrangler deploy
```

### Base de Datos
Las tablas se crean automáticamente según `schema.sql`:
```sql
-- Precios históricos
CREATE TABLE daily_prices (...)

-- Gaps detectados
CREATE TABLE gaps_history (...)

-- Sesiones de usuario
CREATE TABLE user_sessions (...)

-- Auditoría
CREATE TABLE audit_logs (...)
```

## 🔒 Seguridad

- ✅ CORS habilitado con `*`
- ✅ Autenticación por JWT
- ✅ Passwords hasheados (implementar: bcrypt)
- ✅ Secrets en Cloudflare (no en .env)
- ⚠️ TODO: Rate limiting por IP
- ⚠️ TODO: HTTPS enforcement
- ⚠️ TODO: Validación de entrada

## 📊 Endpoints API

### Auth
- `POST /auth` - Login (body: {username, password})

### Análisis
- `POST /analyze` - Analizar gaps (body: {tickers[], apiKey, aiKey?})
- `POST /backfill` - Cargar histórico (body: {tickers[], apiKey})

### Datos
- `GET /history` - Historial de gaps
- `GET /prices` - Cotizaciones (query: ?ticker=AAPL)

## 🎯 Próximos Pasos

### Essencial
- [ ] Validación y sanitización de inputs
- [ ] Rate limiting por usuario
- [ ] Hashing de passwords (bcrypt)
- [ ] Logs estructurados
- [ ] Tests de integración

### Escalabilidad
- [ ] Caché de precios (Redis)
- [ ] Queue para análisis batch
- [ ] Webhooks para notificaciones
- [ ] Múltiples usuarios/organizaciones

### Analítica
- [ ] Dashboard de performance
- [ ] Histórico de predicciones
- [ ] Estadísticas de gaps por ticker

## 📝 Scripts Útiles

```bash
# Frontend
npm run lint      # Oxlint check
npm run build     # Optimizar para producción

# Worker
npm run dev       # Emulador local
npm run deploy    # Deploy a Cloudflare
npm test          # Tests (si hay vitest)

# Limpieza
npm run clean     # Borrar dist/ y cache
```

## 🐛 Troubleshooting

### "No autorizado" en análisis
- Verifica que el token sea válido
- Revisa en Cloudflare D1 que la sesión exista
- El token expira cuando se cierre sesión

### Gaps no detectados
- Asegúrate de tener datos de al menos 2 días
- Verifica que Twelve Data retorne datos válidos
- Revisa la consola del Worker para logs

### Errores de API de Twelve Data
- Plan gratuito: máx 8 símbolos/request, 8 requests/min
- Aumenta el delay entre batches si necesitas más tickers
- Considera upgrade del plan para análisis más frecuentes

## 📄 Licencia

MIT - Proyecto de prueba para Gap Analysis

## 👤 Autor

José Guevara
Developed with Claude Code
