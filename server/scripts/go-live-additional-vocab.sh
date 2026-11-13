#!/usr/bin/env bash
# One-command production apply for Grade 2–4 additional vocabulary.
# Usage on VPS:  curl -fsSL <raw-url> | bash
set -euo pipefail

ROOT="${SIWI_ROOT:-/var/www/siwi}"
BRANCH="feature/central-dictionary-expansion"
BASE="https://raw.githubusercontent.com/siddardhapabbu5-dot/little-readers/${BRANCH}"

cd "$ROOT"
mkdir -p docs/curriculum server/scripts

curl -fsSL -o server/scripts/apply-additional-vocab-production.mjs \
  "$BASE/server/scripts/apply-additional-vocab-production.mjs"
curl -fsSL -o docs/curriculum/additional-vocab-g2-4-enriched.json \
  "$BASE/docs/curriculum/additional-vocab-g2-4-enriched.json"

cd server
export SIWI_ROOT="$ROOT"
export VOCAB_JSON="$ROOT/docs/curriculum/additional-vocab-g2-4-enriched.json"
export ALLOW_PRODUCTION=1
export CONFIRM_PRODUCTION=1

# Resolve packages from the app install (script may be freshly downloaded)
export NODE_PATH="${ROOT}/node_modules:${ROOT}/server/node_modules:${NODE_PATH:-}"

node ./scripts/apply-additional-vocab-production.mjs --apply
echo DONE
