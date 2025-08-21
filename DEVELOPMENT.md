# Development Guide

This document describes the development workflow and tools used in the Runar TypeScript project.

## Prerequisites

- **Bun**: Version 1.1.24 or later
- **Node.js**: Version 18 or 20 (for compatibility testing)
- **Git**: Latest version with git hooks support

## Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd runar-ts
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Install git hooks** (automatically done via postinstall):
   ```bash
   bun run postinstall
   ```

## Development Workflow

### Available Scripts

#### Root Level Commands
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

#### Package Level Commands
Each package has its own scripts:
- `bun run --cwd <package-name> build` - Build specific package
- `bun run --cwd <package-name> test` - Test specific package
- `bun run --cwd <package-name> clean` - Clean specific package

### Code Quality Tools

#### ESLint
- **Configuration**: `.eslintrc.js`
- **Rules**: Strict TypeScript rules with Prettier integration
- **Usage**: `bun run lint` or `bun run lint:fix`

#### Prettier
- **Configuration**: `.prettierrc`
- **Usage**: `bun run format` or `bun run format:check`

#### TypeScript
- **Configuration**: `tsconfig.base.json`
- **Usage**: `bun run type-check`

### Git Hooks

#### Pre-commit Hook
Automatically runs before each commit:
- Type checking
- Linting
- Format checking

#### Commit Message Hook
Enforces conventional commit format:
- Format: `<type>(<scope>): <description>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`

### Local Development

1. **Before starting work**:
   ```bash
   bun run clean
   bun install
   ```

2. **During development**:
   ```bash
   # Run tests in watch mode
   bun run test:watch
   
   # Check types
   bun run type-check
   
   # Lint and format
   bun run lint:fix
   bun run format
   ```

3. **Before committing**:
   ```bash
   # Run full CI pipeline locally
   bun run ci
   ```

4. **If CI fails locally**:
   - Fix linting issues: `bun run lint:fix`
   - Fix formatting: `bun run format`
   - Fix type errors: Check TypeScript output
   - Re-run tests: `bun run test`

## CI/CD Pipeline

### GitHub Actions

The CI pipeline runs on:
- Push to `main` and `develop` branches
- Pull requests to `main` and `develop` branches

#### Jobs

1. **Test Job**:
   - Runs on Node.js 18 and 20
   - Type checking
   - Linting
   - Format checking
   - Building
   - Testing

2. **Security Job**:
   - Dependency audit
   - Outdated dependency check

3. **Build Artifacts Job** (main branch only):
   - Builds and uploads artifacts

### Local CI

Run the full CI pipeline locally:
```bash
bun run ci
```

This command runs:
1. Clean all packages
2. Build all packages
3. Lint all code
4. Check formatting
5. Type checking
6. Run all tests

## Troubleshooting

### Common Issues

#### Linting Errors
```bash
# Fix auto-fixable issues
bun run lint:fix

# Check specific files
bun run lint -- path/to/file.ts
```

#### Formatting Issues
```bash
# Format all files
bun run format

# Check specific files
bun run format:check -- path/to/file.ts
```

#### Type Errors
```bash
# Check types
bun run type-check

# Check specific package
bun run --cwd <package-name> build
```

#### Test Failures
```bash
# Run tests for specific package
bun run --cwd <package-name> test

# Run tests with verbose output
bun run --cwd <package-name> test --verbose
```

### Git Hook Issues

If git hooks aren't working:
```bash
# Reinstall hooks
bun run postinstall

# Or manually
npx husky install
```

## Best Practices

1. **Always run `bun run ci` before pushing**
2. **Use conventional commit messages**
3. **Fix linting and formatting issues before committing**
4. **Keep dependencies up to date**
5. **Write tests for new functionality**
6. **Use TypeScript strict mode**

## IDE Setup

### VS Code
Recommended extensions:
- ESLint
- Prettier
- TypeScript Importer
- GitLens

### Configuration
Add to your VS Code settings:
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```
