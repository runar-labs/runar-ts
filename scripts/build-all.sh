#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

for d in runar-ts-*; do
  echo "Building $d"
  (cd "$d" && bun run build)
done


