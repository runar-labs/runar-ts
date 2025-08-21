# Runar TypeScript

A TypeScript implementation of the Runar distributed computing framework.

## 🚀 Quick Start

### Prerequisites

- **Bun**: Version 1.1.24 or later
- **Node.js**: Version 18 or 20 (for compatibility testing)

### Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd runar-ts
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Setup development environment**:
   ```bash
   ./scripts/dev-setup.sh
   ```

## 📦 Packages

This repository contains several TypeScript packages:

- **`runar-ts-common`**: Common utilities, routing, and logging
- **`runar-ts-decorators`**: TypeScript decorators for metadata
- **`runar-ts-schemas`**: Data schemas and types
- **`runar-ts-serializer`**: Serialization and encryption
- **`runar-ts-node`**: Core node implementation
- **`runar-ts-bun-ffi`**: Bun-specific FFI bindings (parked)

## 🛠️ Development

### Available Scripts

- `bun run build` - Build all packages
- `bun run clean` - Clean all build artifacts
- `bun run test` - Run tests in all packages
- `bun run test:watch` - Run tests in watch mode
- `bun run lint` - Run ESLint on all TypeScript files
- `bun run lint:fix` - Fix auto-fixable ESLint issues
- `bun run format` - Format all code with Prettier
- `bun run format:check` - Check if code is properly formatted
- `bun run type-check` - Run TypeScript type checking
- `bun run ci` - Run full CI pipeline locally

### Code Quality

The project uses:
- **ESLint** for code linting with TypeScript support
- **Prettier** for code formatting
- **TypeScript** for type checking
- **Husky** for git hooks
- **lint-staged** for pre-commit formatting

### Git Hooks

- **Pre-commit**: Runs linting, formatting, and type checking
- **Commit-msg**: Enforces conventional commit format

## 🔄 CI/CD

GitHub Actions automatically runs on:
- Push to `main` and `develop` branches
- Pull requests to `main` and `develop` branches

The CI pipeline includes:
- Building all packages
- Running tests
- Linting and formatting checks
- Type checking
- Security audits

## 📚 Documentation

- [Development Guide](DEVELOPMENT.md) - Comprehensive development workflow
- [Local Features Plan](LOCAL_FEATURES_PLAN.md) - Feature roadmap

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `bun run ci` to ensure quality
5. Submit a pull request

## 📄 License

[Add your license information here]
