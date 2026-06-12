#!/bin/bash
set -e

echo "🃏 Tarot Poster Service Starting..."
echo "   PORT: ${PORT:-7860}"
echo "   NODE_ENV: ${NODE_ENV:-production}"

# 确保 Chromium 可用
if [ -x "$PUPPETEER_EXECUTABLE_PATH" ]; then
  echo "   Chromium: $PUPPETEER_EXECUTABLE_PATH ($($PUPPETEER_EXECUTABLE_PATH --version | head -1))"
else
  echo "   ⚠️ Chromium not found at $PUPPETEER_EXECUTABLE_PATH"
fi

exec "$@"
