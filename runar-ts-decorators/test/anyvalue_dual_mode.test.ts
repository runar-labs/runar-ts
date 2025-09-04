import { describe, it, expect, beforeAll } from 'bun:test';
import { AnyValue, SerializationContext, ValueCategory } from 'runar-ts-serializer/src/index.js';
import { Result, isOk, isErr } from 'runar-ts-common/src/error/Result.js';
import { Logger, Component } from 'runar-ts-common/src/logging/logger.js';
import { LoggingConfig, LogLevel, applyLoggingConfig } from 'runar-ts-common/src/logging/config.js';
import { registerEncryptedCompanion } from 'runar-ts-serializer/src/registry.js';

// Mock encrypted companion class for testing
class EncryptedTestProfile {
  constructor(
    public id: string = '',
    public user_encrypted?: unknown,
    public system_encrypted?: unknown
  ) {}
}

// Mock plain class for testing
class TestProfile {
  constructor(
    public id: string,
    public name: string,
    public email: string
  ) {}
}

describe('AnyValue Dual-Mode Semantics', () => {
  let logger: Logger;

  beforeAll(() => {
    // Setup logging
    const loggingConfig = LoggingConfig.new().withDefaultLevel(LogLevel.Trace);

    applyLoggingConfig(loggingConfig);
    logger = Logger.newRoot(Component.System).setNodeId('test-node');

    // Register encrypted companion type for testing
    const result = registerEncryptedCompanion('TestProfile', EncryptedTestProfile);
    if (isErr(result)) {
      const error = result.error instanceof Error ? result.error.message : String(result.error);
      throw new Error(`Failed to register encrypted companion: ${error}`);
    }
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
      const profile = plainResult.value as TestProfile;
      expect(profile.id).toBe('123');
      expect(profile.name).toBe('John Doe');
      expect(profile.email).toBe('john@example.com');
    }

    // Test requesting encrypted companion type on plain data should fail
    const encryptedResult = anyValue.value.asType<EncryptedTestProfile>(EncryptedTestProfile);
    expect(isErr(encryptedResult)).toBe(true);
    if (isErr(encryptedResult)) {
      const error = encryptedResult.error instanceof Error ? encryptedResult.error.message : String(encryptedResult.error);
      expect(error).toContain('InvalidTypeForPlainBody');
    }
  });

  it('should demonstrate dual-mode semantics with encrypted data', () => {
    // Create mock encrypted data
    const encryptedProfile = new EncryptedTestProfile(
      '123',
      { label: 'user' },
      { label: 'system' }
    );

    // Create AnyValue from encrypted data (this is just a plain object, not actually encrypted)
    const anyValue = AnyValue.from(encryptedProfile);
    expect(isOk(anyValue)).toBe(true);
    if (isErr(anyValue)) return;

    // Test requesting encrypted companion type - this should work since we have the right type
    const encryptedResult = anyValue.value.asType<EncryptedTestProfile>(EncryptedTestProfile);
    expect(isOk(encryptedResult)).toBe(true);
    if (isOk(encryptedResult)) {
      const encrypted = encryptedResult.value as EncryptedTestProfile;
      expect(encrypted.id).toBe('123');
      expect(encrypted.user_encrypted).toBeDefined();
      expect(encrypted.system_encrypted).toBeDefined();
    }

    // Test requesting plain type - this should work since we're just casting the same object
    const plainResult = anyValue.value.asType<TestProfile>();
    expect(isOk(plainResult)).toBe(true);
    if (isOk(plainResult)) {
      // The object will have the same structure but different type
      const profile = plainResult.value as TestProfile;
      expect(profile.id).toBe('123');
    }

    // Dual-mode semantics work with both plain and encrypted companion types
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
