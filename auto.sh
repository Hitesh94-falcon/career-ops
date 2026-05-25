#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Job pipeline starting (GitHub Actions mode)..."

# In CI/GitHub Actions, 'npm ci' is always preferred over 'npm install'
echo "📦 Installing dependencies..."
npm ci

# Fixes the "Executable doesn't exist" Playwright error
echo "🌐 Installing Playwright headless browsers..."
npx playwright install --with-deps

echo "🔍 Running scan..."
# Removed the || echo bypass so GitHub properly flags it if the scraper fails
npm run scan

echo "🤖 Running auto ranking..."
node rank-jobs-auto.mjs

echo "✅ Done"