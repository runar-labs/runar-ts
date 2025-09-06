# Runar TypeScript Decorators

A TypeScript implementation of the Runar encryption framework decorators, providing field-level encryption with label-based access control.

## Overview

This package provides TypeScript decorators (`@Encrypt` and `@runar`) for automatic field-level encryption with fine-grained access control. It integrates with the Runar serialization system to provide seamless encryption/decryption of structured data.

## Features

- **Field-Level Encryption**: Use `@runar('label')` to encrypt individual fields
- **Label-Based Access Control**: Different encryption labels for different access patterns
- **AnyValue Integration**: Seamless serialization/deserialization with encryption
- **Dual-Mode Semantics**: Get both plain and encrypted types from the same data
- **TypeScript 5 Decorators**: Uses modern TypeScript decorator syntax
- **Build-Time Type Generation**: Automatically generates encrypted companion types

## Quick Start

### 1. Build the Package

**IMPORTANT**: You must run the build process before running tests, as it compiles fixtures and generates types.

```bash
bun run build
```

This command does the following:

1. **Generates Types**: Runs the type generator to create `src/encrypted-types.ts`
2. **Compiles Main Package**: Compiles the main decorator code to `dist/`
3. **Compiles Test Fixtures**: Compiles test fixtures (which use decorators) to `test_fixtures/dist/`

### 2. Run Tests

```bash
# Run all tests
bun test

# Run specific test files
bun test test/encryption.test.ts
bun test test/anyvalue_encryption.test.ts
```

## Folder Structure

```
runar-ts-decorators/
├── src/                          # Main package source code
│   ├── index.ts                  # Main decorator exports
│   ├── helpers.ts                # Utility functions
│   ├── encrypted-types.ts        # Generated encrypted companion types
│   └── index.d.ts                # TypeScript declarations
├── test/                         # Test files
│   ├── encryption.test.ts        # Direct encryption/decryption tests
│   ├── anyvalue_encryption.test.ts # AnyValue serialization tests
│   └── test_utils/               # Shared test utilities
│       └── key_managers.ts       # TestEnvironment class
├── test_fixtures/                # Test fixtures (decorated classes)
│   ├── test_fixtures.ts          # TestProfile class with decorators
│   ├── tsconfig.json             # TypeScript config for fixtures
│   └── dist/                     # Compiled fixtures
├── generator/                    # Build-time type generation
│   └── generate-types.ts         # TypeScript AST analyzer & generator
├── dist/                         # Compiled main package
├── dist-test/                    # Compiled test files
├── package.json                  # Package configuration
└── tsconfig.json                 # Main TypeScript configuration
```

## Build Process Explained

### `bun run build` Command Breakdown

The build script (`cd generator && bun run generate-types.ts && cd .. && tsc -p tsconfig.json && cd test_fixtures && tsc`) performs these steps:

#### 1. Type Generation (`cd generator && bun run generate-types.ts`)

- **Analyzes** `test_fixtures/test_fixtures.ts` for `@Encrypt` decorated classes
- **Extracts** field encryption metadata from `@runar('label')` decorators
- **Generates** `src/encrypted-types.ts` with encrypted companion interfaces
- **Creates** interfaces that extend `RunarEncryptable` for runtime methods

#### 2. Main Package Compilation (`tsc -p tsconfig.json`)

- **Compiles** `src/` directory to `dist/`
- **Generates** TypeScript declarations (`index.d.ts`)
- **Uses** TypeScript 5 decorator syntax (no legacy decorators)

#### 3. Test Fixtures Compilation (`cd test_fixtures && tsc`)

- **Compiles** `test_fixtures/test_fixtures.ts` to `test_fixtures/dist/`
- **Processes** TypeScript 5 decorators on `TestProfile` class
- **Generates** declaration files for type imports

## Usage Examples

### Basic Field Encryption

```typescript
import { Encrypt, runar } from 'runar-ts-decorators';

@Encrypt
class UserProfile {
  id: string; // Plain field
  @runar('user') name: string; // User-encrypted field
  @runar('system') email: string; // System-encrypted field
  @runar('search') phone: string; // Search-encrypted field
  @runar('system_only') metadata: string; // System-only encrypted field

  constructor(id: string, name: string, email: string, phone: string, metadata: string) {
    this.id = id;
    this.name = name;
    this.email = email;
    this.phone = phone;
    this.metadata = metadata;
  }
}
```

### AnyValue Serialization with Encryption

```typescript
import { AnyValue } from 'runar-ts-serializer';
import { UserProfile } from './UserProfile';

// Create instance
const profile = new UserProfile('123', 'John', 'john@example.com', '555-1234', 'admin');

// Serialize with encryption context
const context = createSerializationContext(keystore);
const serialized = AnyValue.newStruct(profile).serialize(context);

// Deserialize with different keystore (access control)
const deserialized = AnyValue.deserialize(serialized.value, differentKeystore, logger);
const decryptedProfile = deserialized.value.asType<UserProfile>();
```

### Direct Encryption/Decryption

```typescript
import { RunarEncryptable } from 'runar-ts-decorators';

// Encrypt
const encryptable = profile as UserProfile & RunarEncryptable<UserProfile, EncryptedUserProfile>;
const encrypted = encryptable.encryptWithKeystore(keystore, resolver);

// Decrypt
const decrypted = encrypted.value.decryptWithKeystore(keystore, logger);
```

## Test Structure

### `encryption.test.ts` - Direct Encryption Tests

- **Direct** `encryptWithKeystore`/`decryptWithKeystore` calls
- **Keystore capability** validation
- **PKI workflow** validation
- **Multi-recipient envelope** encryption
- **Network-only** encryption

### `anyvalue_encryption.test.ts` - AnyValue Integration Tests

- **AnyValue serialization** with encryption context
- **AnyValue deserialization** with keystore
- **Dual-mode semantics** (plain + encrypted types from same data)
- **Cross-keystore access control** through AnyValue
- **Performance validation** for large data
- **Concurrent encryption** handling

## Access Control Labels

| Label         | Description       | Access Pattern                                  |
| ------------- | ----------------- | ----------------------------------------------- |
| `user`        | User profile data | Mobile devices with user keys                   |
| `system`      | System data       | Both mobile (user keys) and node (network keys) |
| `search`      | Searchable data   | Mobile devices with user keys                   |
| `system_only` | System-only data  | Node devices with network keys only             |

## Development Workflow

### 1. Making Changes

```bash
# Edit source files
vim src/index.ts

# Edit test fixtures
vim test_fixtures/test_fixtures.ts

# Edit tests
vim test/encryption.test.ts
```

### 2. Building

```bash
# Full build (generates types + compiles everything)
bun run build

# Just generate types
bun run generate-types

# Just compile main package
tsc -p tsconfig.json

# Just compile fixtures
cd test_fixtures && tsc
```

### 3. Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test test/encryption.test.ts

# Run with verbose output
bun test --verbose
```

## Troubleshooting

### Common Issues

#### "Cannot find module" errors

- **Solution**: Run `bun run build` first to compile fixtures and generate types

#### "context.addInitializer is not a function"

- **Solution**: Tests must run on compiled JavaScript, not TypeScript source files

#### Import path errors

- **Solution**: Don't add `.js` extensions to imports in TypeScript files

#### Type generation errors

- **Solution**: Ensure `@Encrypt` decorator is applied to classes with `@runar` fields

### Build Requirements

- **Bun**: JavaScript runtime for running tests and scripts
- **TypeScript 5+**: For modern decorator support
- **Node.js**: For native API bindings

## Integration with Runar Ecosystem

This package integrates with:

- **runar-ts-serializer**: For AnyValue serialization
- **runar-ts-node**: For keystore management
- **runar-ts-common**: For Result types and logging
- **runar-nodejs-api**: For native cryptographic operations

## Contributing

1. **Follow TypeScript 5 decorator syntax**
2. **No `.js` extensions in imports**
3. **Use proper types, avoid `any`**
4. **Run `bun run build` before testing**
5. **Maintain Rust parity** in test scenarios
6. **No mocks or shortcuts** - use real cryptographic operations

## License

Part of the Runar encryption framework.
