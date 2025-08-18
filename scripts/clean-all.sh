#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

for d in runar-ts-*; do
  echo "Cleaning $d"
  (cd "$d" && bun run clean || true)
done


