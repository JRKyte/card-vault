#!/bin/sh
# Rebuild the card fingerprints the scanner matches pictures against (public/fingerprints).
# Run after new sets come out. Downloads every card's small image once (~3GB, kept in the cache
# dir so later runs only fetch new cards), then about 30ms a card per model. Usage:
#   npm run fingerprints [cache dir]
set -e
cache="${1:-.fingerprint-cache}"
npx vite-node scripts/fingerprints/list.ts "$cache"
node scripts/fingerprints/download.mjs "$cache"
node scripts/fingerprints/embed.mjs "$cache"
node scripts/fingerprints/pack.mjs "$cache"
