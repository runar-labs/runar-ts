#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

# Build in dependency order
for d in runar-ts-common runar-ts-schemas runar-ts-decorators runar-ts-serializer runar-ts-ffi runar-ts-node; do
  if [ -d "$d" ]; then
    echo "Building $d"
    (cd "$d" && bun run build)
  fi
done


