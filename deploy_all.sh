#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

echo "Running D1 Session Table Migration..."
cd /home/jose/xerebrum/sites/I/ivanbarbero/worker
npx wrangler d1 execute gap-analyzer-db --remote --command "CREATE TABLE IF NOT EXISTS user_sessions (token TEXT PRIMARY KEY, username TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"

echo "Deploying Worker..."
npx wrangler deploy

echo "Building and Deploying Frontend..."
cd /home/jose/xerebrum/sites/I/ivanbarbero/frontend
rm -rf node_modules/.cache/wrangler
npm run build
export CLOUDFLARE_ACCOUNT_ID="4332c80d60c65b8191fa453f3bb0ee74"
npx wrangler pages deploy dist --project-name gap-analyzer-ivan --branch main
