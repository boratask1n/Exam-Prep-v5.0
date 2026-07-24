#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo
echo "============================================"
echo " Desktop Guncelleme Gonder"
echo "============================================"
echo

node artifacts/desktop-shell/scripts/publish-update.cjs "$@"

echo
echo "[TAMAM] Guncelleme paketi hazir."
echo "Klasor:"
echo "  artifacts/desktop-shell/publish/desktop-updates"
echo
