#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

echo "Building Frontend..."
cd /home/jose/xerebrum/sites/I/ivanbarbero/frontend
npm run build

echo "Deploying Frontend..."
export CLOUDFLARE_ACCOUNT_ID="4332c80d60c65b8191fa453f3bb0ee74"
npx wrangler pages deploy dist --project-name gap-analyzer-ivan --branch main
