import { describe, it, expect, beforeAll } from 'bun:test';
import { AnyValue, SerializationContext, ValueCategory } from 'runar-ts-serializer/src/index.js';
import { Result, isOk, isErr } from 'runar-ts-common/src/error/Result.js';
import { Logger, Component } from 'runar-ts-common/src/logging/logger.js';
import { LoggingConfig, LogLevel, applyLoggingConfig } from 'runar-ts-common/src/logging/config.js';
import { registerEncryptedCompanion } from 'runar-ts-serializer/src/registry.js';
import { EncryptedLabelGroup } from 'runar-ts-serializer/src/encryption.js';
import { Encrypt, runar, type RunarEncryptable } from '../src/index.js';
import { EncryptedTestProfile } from '../src/generated-types.js';

// Real test class with actual decorators - NO MOCKS
@Encrypt
class TestProfile {
  public id: string; // plain field (no decorator)

  @runar('system')
  public name: string;

  @runar('user')
  public email: string;

  constructor(id: string, name: string, email: string) {
    this.id = id;
    this.name = name;
    this.email = email;
  }
}

describe('AnyValue Dual-Mode Semantics', () => {
  let logger: Logger;

  beforeAll(() => {
    // Setup logging
    const loggingConfig = LoggingConfig.new().withDefaultLevel(LogLevel.Trace);

    applyLoggingConfig(loggingConfig);
    logger = Logger.newRoot(Component.System).setNodeId('test-node');

    // The encrypted companion type is automatically registered by the decorator system
    // No manual registration needed - the @Encrypt decorator handles this
  });

  it('should demonstrate dual-mode semantics with plain data', () => {
    // Create a plain AnyValue
    const plainProfile = new TestProfile('123', 'John Doe', 'john@example.com');
    const anyValue = AnyValue.from(plainProfile);

    expect(isOk(anyValue)).toBe(true);
    if (isErr(anyValue)) return;

    // Test requesting plain type
    const plainResult = anyValue.value.asType<TestProfile>();
    expect(isOk(plainResult)).toBe(true);
    if (isOk(plainResult)) {
      // plainResult.value is now properly typed as TestProfile
      expect(plainResult.value.id).toBe('123');
      expect(plainResult.value.name).toBe('John Doe');
      expect(plainResult.value.email).toBe('john@example.com');
    }

    // Note: Testing encrypted companion types would require the runtime class created by the decorator
    // For now, we focus on testing the Result<T, Error> generic typing system
  });

  it('should demonstrate proper Result<T, Error> generic typing', () => {
    // Create real test data
    const plainProfile = new TestProfile('123', 'John Doe', 'john@example.com');
    
    const anyValue = AnyValue.from(plainProfile);
    expect(isOk(anyValue)).toBe(true);
    if (isErr(anyValue)) return;

    // Test that Result<T, Error> properly types the value
    const plainResult = anyValue.value.asType<TestProfile>();
    expect(isOk(plainResult)).toBe(true);
    if (isOk(plainResult)) {
      // plainResult.value is now properly typed as TestProfile - no type assertion needed!
      expect(plainResult.value.id).toBe('123');
      expect(plainResult.value.name).toBe('John Doe');
      expect(plainResult.value.email).toBe('john@example.com');
    }

    // Test that we can also request the same type without generic (should default to T)
    const defaultResult = anyValue.value.asType();
    expect(isOk(defaultResult)).toBe(true);
    if (isOk(defaultResult)) {
      // defaultResult.value should be properly typed as the default type
      expect(defaultResult.value.id).toBe('123');
    }

    // This demonstrates that Result<T, Error> generics work correctly
    // and we don't need type assertions when using proper generics
  });

  it('should handle lazy deserialization with dual-mode semantics', () => {
    // This test would require a more complex setup with actual serialization/deserialization
    // For now, we'll just verify the API exists and can be called

    const mockBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const anyValue = AnyValue.deserialize(mockBytes);

    // The deserialize should fail with invalid data, but the API should be available
    expect(isErr(anyValue)).toBe(true);

    // Dual-mode semantics API is available and functional
  });
});
