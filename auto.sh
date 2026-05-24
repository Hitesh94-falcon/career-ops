#!/bin/bash

set -e

echo "🚀 Job pipeline starting (GitHub Actions mode)..."

npm ci || npm install

echo "🔍 Running scan..."
npm run scan || echo "⚠️ scan failed, continuing"

echo "🤖 Running auto ranking..."
node rank-jobs-auto.mjs

echo "✅ Done"