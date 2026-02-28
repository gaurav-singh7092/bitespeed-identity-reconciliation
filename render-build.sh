#!/usr/bin/env bash
# render-build.sh — Render Build Command
set -o errexit

npm install
npx prisma generate
npx prisma migrate deploy
npm run build
