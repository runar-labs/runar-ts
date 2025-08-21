#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

echo "🧹 Cleaning previous builds..."
for d in runar-ts-common runar-ts-schemas runar-ts-decorators runar-ts-serializer runar-ts-node; do
  if [ -d "$d" ]; then
    echo "Cleaning $d"
    (cd "$d" && bun run clean)
  fi
done

echo "🔨 Building packages in dependency order..."

# Build in dependency order
for d in runar-ts-common runar-ts-schemas runar-ts-decorators runar-ts-serializer runar-ts-node; do
  if [ -d "$d" ]; then
    echo "Building $d"
    (cd "$d" && bun run build)
    
    # Verify the build output
    if [ -d "$d/dist" ]; then
      echo "✅ $d built successfully"
    else
      echo "❌ $d build failed - no dist directory"
      exit 1
    fi
  fi
done

echo "🎉 All packages built successfully!"


