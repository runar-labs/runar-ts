#!/bin/bash

echo "🚀 Setting up Runar TypeScript development environment..."

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install Bun first:"
    echo "   curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

echo "✅ Bun is installed: $(bun --version)"

# Check if Node.js is installed (for compatibility testing)
if ! command -v node &> /dev/null; then
    echo "⚠️  Node.js is not installed. Some compatibility tests may fail."
else
    echo "✅ Node.js is installed: $(node --version)"
fi

# Clean and install dependencies
echo "🧹 Cleaning previous builds..."
bun run clean

echo "📦 Installing dependencies..."
bun install

echo "🔧 Setting up git hooks..."
bun run postinstall

echo "✅ Development environment setup complete!"
echo ""
echo "📋 Available commands:"
echo "  bun run build      - Build all packages"
echo "  bun run test       - Run all tests"
echo "  bun run lint       - Lint all code"
echo "  bun run format     - Format all code"
echo "  bun run type-check - Check TypeScript types"
echo "  bun run ci         - Run full CI pipeline locally"
echo ""
echo "🎯 Next steps:"
echo "  1. Run 'bun run ci' to verify everything works"
echo "  2. Check out DEVELOPMENT.md for detailed workflow"
echo "  3. Start coding! 🚀"
