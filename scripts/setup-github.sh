#!/bin/bash

# Script de configuración automática de GitHub + Cloudflare
# Uso: bash scripts/setup-github.sh

set -e

echo "🚀 Gap Analyzer - GitHub + Cloudflare Setup"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Verificar si gh CLI está instalado
echo "1️⃣  Verificando gh CLI..."
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ gh CLI no está instalado${NC}"
    echo "   Instala desde: https://cli.github.com/"
    exit 1
fi
echo -e "${GREEN}✓ gh CLI encontrado${NC}"
echo ""

# 2. Verificar si wrangler está instalado
echo "2️⃣  Verificando Wrangler..."
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Wrangler no está instalado${NC}"
    echo "   Instala: npm install -g wrangler"
    exit 1
fi
echo -e "${GREEN}✓ Wrangler encontrado${NC}"
echo ""

# 3. Obtener valores necesarios
echo "3️⃣  Obteniendo información de Cloudflare..."

# Account ID
echo -n "   📝 Ingresa tu Cloudflare Account ID (o presiona Enter para auto-detectar): "
read -r ACCOUNT_ID_INPUT

if [ -z "$ACCOUNT_ID_INPUT" ]; then
    echo "   🔍 Auto-detectando Account ID..."
    ACCOUNT_ID=$(npx wrangler whoami 2>/dev/null | grep -oP '(?<=account_id: )\w+' || echo "")
    if [ -z "$ACCOUNT_ID" ]; then
        echo -e "${YELLOW}⚠️  No se pudo auto-detectar. Debes estar autenticado con: wrangler login${NC}"
        exit 1
    fi
else
    ACCOUNT_ID="$ACCOUNT_ID_INPUT"
fi

echo -e "${GREEN}✓ Account ID: $ACCOUNT_ID${NC}"

# API Token
echo ""
echo "   📝 Ingresa tu Cloudflare API Token:"
echo "      (Crear en: https://dash.cloudflare.com/profile/api-tokens)"
read -rs API_TOKEN
echo ""

if [ -z "$API_TOKEN" ]; then
    echo -e "${RED}❌ API Token no puede estar vacío${NC}"
    exit 1
fi

echo -e "${GREEN}✓ API Token recibido${NC}"

# 4. Actualizar wrangler.jsonc
echo ""
echo "4️⃣  Actualizando wrangler.jsonc..."

WRANGLER_FILE="worker/wrangler.jsonc"
if [ -f "$WRANGLER_FILE" ]; then
    # Usar sed para reemplazar account_id
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/\"account_id\": \"[^\"]*\"/\"account_id\": \"$ACCOUNT_ID\"/" "$WRANGLER_FILE"
    else
        # Linux
        sed -i "s/\"account_id\": \"[^\"]*\"/\"account_id\": \"$ACCOUNT_ID\"/" "$WRANGLER_FILE"
    fi
    echo -e "${GREEN}✓ wrangler.jsonc actualizado${NC}"
else
    echo -e "${RED}❌ No encontré $WRANGLER_FILE${NC}"
    exit 1
fi

# 5. Crear/actualizar GitHub repository
echo ""
echo "5️⃣  Configurando GitHub repository..."

CURRENT_REMOTE=$(git config --get remote.origin.url 2>/dev/null || echo "")

if [ -z "$CURRENT_REMOTE" ]; then
    echo "   📝 Ingresa tu GitHub username: "
    read -r GITHUB_USER

    echo "   📝 Ingresa el nombre del repositorio (default: gap-analyzer): "
    read -r REPO_NAME
    REPO_NAME=${REPO_NAME:-gap-analyzer}

    GITHUB_URL="https://github.com/$GITHUB_USER/$REPO_NAME.git"

    echo "   🔗 Agregando remote: $GITHUB_URL"
    git remote add origin "$GITHUB_URL" 2>/dev/null || echo "   (Remote ya existe)"
else
    echo "   ✓ Remote ya configurado: $CURRENT_REMOTE"
fi

echo -e "${GREEN}✓ GitHub repository configurado${NC}"

# 6. Agregar secrets a GitHub
echo ""
echo "6️⃣  Agregando secrets a GitHub..."

# Necesitar estar autenticado en gh
if ! gh auth status &>/dev/null; then
    echo -e "${YELLOW}⚠️  No estás autenticado en gh${NC}"
    echo "   Ejecuta: gh auth login"
    exit 1
fi

echo "   Agregando secrets..."

# Valores por defecto
echo -n "   VITE_API_URL (default: https://gap-analyzer-api.xerebrumgroup.com): "
read -r VITE_API_URL
VITE_API_URL=${VITE_API_URL:-"https://gap-analyzer-api.xerebrumgroup.com"}

echo -n "   TWELVEDATA_API_KEY: "
read -rs TWELVEDATA_API_KEY
echo ""

echo -n "   ANTHROPIC_API_KEY (opcional, presiona Enter para saltar): "
read -rs ANTHROPIC_API_KEY
echo ""

echo -n "   OPENAI_API_KEY (opcional, presiona Enter para saltar): "
read -rs OPENAI_API_KEY
echo ""

echo -n "   APP_USERNAME (default: admin): "
read -r APP_USERNAME
APP_USERNAME=${APP_USERNAME:-"admin"}

echo -n "   APP_PASSWORD: "
read -rs APP_PASSWORD
echo ""

echo -n "   TICKERS (default: AAPL,MSFT,TSLA): "
read -r TICKERS
TICKERS=${TICKERS:-"AAPL,MSFT,TSLA"}

# Agregar los secrets
echo "   Pushing secrets to GitHub..."

gh secret set CLOUDFLARE_API_TOKEN <<< "$API_TOKEN" 2>/dev/null && echo "   ✓ CLOUDFLARE_API_TOKEN"
gh secret set CLOUDFLARE_ACCOUNT_ID <<< "$ACCOUNT_ID" 2>/dev/null && echo "   ✓ CLOUDFLARE_ACCOUNT_ID"
gh secret set VITE_API_URL <<< "$VITE_API_URL" 2>/dev/null && echo "   ✓ VITE_API_URL"

if [ -n "$TWELVEDATA_API_KEY" ]; then
    gh secret set TWELVEDATA_API_KEY <<< "$TWELVEDATA_API_KEY" 2>/dev/null && echo "   ✓ TWELVEDATA_API_KEY"
fi

if [ -n "$ANTHROPIC_API_KEY" ]; then
    gh secret set ANTHROPIC_API_KEY <<< "$ANTHROPIC_API_KEY" 2>/dev/null && echo "   ✓ ANTHROPIC_API_KEY"
fi

if [ -n "$OPENAI_API_KEY" ]; then
    gh secret set OPENAI_API_KEY <<< "$OPENAI_API_KEY" 2>/dev/null && echo "   ✓ OPENAI_API_KEY"
fi

gh secret set APP_USERNAME <<< "$APP_USERNAME" 2>/dev/null && echo "   ✓ APP_USERNAME"
gh secret set APP_PASSWORD <<< "$APP_PASSWORD" 2>/dev/null && echo "   ✓ APP_PASSWORD"
gh secret set TICKERS <<< "$TICKERS" 2>/dev/null && echo "   ✓ TICKERS"

echo -e "${GREEN}✓ Secrets agregados a GitHub${NC}"

# 7. Verificar Cloudflare Pages
echo ""
echo "7️⃣  Verificando Cloudflare Pages..."
echo "   📝 Ingresa el nombre del proyecto en Pages (default: gap-analyzer-frontend): "
read -r PAGES_PROJECT
PAGES_PROJECT=${PAGES_PROJECT:-"gap-analyzer-frontend"}

echo -e "${YELLOW}⚠️  Importante: Debes crear el proyecto manualmente en Cloudflare Pages${NC}"
echo "   URL: https://pages.cloudflare.com"
echo "   Pasos:"
echo "   1. Create project → Connect to Git"
echo "   2. Seleccionar tu repositorio"
echo "   3. Build command: cd frontend && npm install && npm run build"
echo "   4. Build output: frontend/dist"
echo ""
read -p "   Presiona Enter cuando hayas creado el proyecto en Pages..."

# 8. Push inicial
echo ""
echo "8️⃣  Preparando primer push a GitHub..."

if [ -z "$(git status --porcelain)" ]; then
    echo "   ✓ No hay cambios pendientes"
else
    echo "   🔄 Hay cambios pendientes. Haciendo commit..."
    git add .github/ scripts/ worker/wrangler.jsonc GITHUB_SETUP.md
    git commit -m "ci: Configure GitHub Actions and Cloudflare auto-deploy" || true
fi

echo "   🚀 Haciendo push a main..."
git branch -M main 2>/dev/null || true
git push -u origin main 2>/dev/null || {
    echo -e "${RED}❌ Error al hacer push. Verifica que el repositorio existe.${NC}"
    exit 1
}

echo -e "${GREEN}✓ Push completado${NC}"

# 9. Verificar workflow
echo ""
echo "9️⃣  Verificando GitHub Actions..."
sleep 3

if gh run list --limit 1 &>/dev/null; then
    echo -e "${GREEN}✓ Workflow ejecutándose${NC}"
    echo "   👀 Ver logs en: https://github.com/$GITHUB_USER/$REPO_NAME/actions"
else
    echo -e "${YELLOW}⚠️  Workflow aún no aparece. Intenta en 30 segundos.${NC}"
fi

# Resumen final
echo ""
echo "========================================="
echo -e "${GREEN}✅ Setup Completado${NC}"
echo "========================================="
echo ""
echo "📊 Resumen:"
echo "   Account ID: $ACCOUNT_ID"
echo "   GitHub: $CURRENT_REMOTE"
echo "   API Secrets: Agregados ✓"
echo ""
echo "🚀 Próximos pasos:"
echo "   1. Ve a: https://github.com/tu-usuario/tu-repo/actions"
echo "   2. Verifica que el workflow se ejecute"
echo "   3. Mira el status en Cloudflare Pages y Workers"
echo ""
echo "📖 Documentación:"
echo "   - GITHUB_SETUP.md - Guía completa"
echo "   - README.md - Overview del proyecto"
echo "   - DEPLOYMENT.md - Guía de deployment"
echo ""
echo -e "${GREEN}🎉 ¡Todo listo para auto-deploy!${NC}"
