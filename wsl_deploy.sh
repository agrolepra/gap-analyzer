#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

echo "Initializing DB..."
cd /home/jose/xerebrum/sites/I/ivanbarbero/worker
# npx wrangler d1 execute gap-analyzer-db --remote --file=./schema.sql

echo "Deploying Worker..."
npx wrangler deploy
