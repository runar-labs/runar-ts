import { describe, it, expect, beforeAll } from 'bun:test';
import { AnyValue } from 'runar-ts-serializer/src/index';
import { Result, isOk, isErr } from 'runar-ts-common/src/error/Result';
import { Logger, Component } from 'runar-ts-common/src/logging/logger';
import { LoggingConfig, LogLevel, applyLoggingConfig } from 'runar-ts-common/src/logging/config';
import { TestProfile } from '../test_fixtures/dist/test_fixtures/test_fixtures';

describe('AnyValue Dual-Mode Semantics', () => {
  let logger: Logger;

  beforeAll(() => {
    // Setup logging
    const loggingConfig = LoggingConfig.new().withDefaultLevel(LogLevel.Trace);
    applyLoggingConfig(loggingConfig);
    logger = Logger.newRoot(Component.System).setNodeId('test-node');
  });

  it('should demonstrate dual-mode semantics with plain data', () => {
    // Create a plain AnyValue
    const plainProfile = new TestProfile('123', 'John Doe', 'private data', 'john@example.com', 'system metadata');
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
  });

  it('should demonstrate proper Result<T, Error> generic typing', () => {
    // Create real test data
    const plainProfile = new TestProfile('123', 'John Doe', 'private data', 'john@example.com', 'system metadata');

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

  it('should demonstrate that dual-mode semantics work with proper Result<T, Error> typing', () => {
    // Create a plain AnyValue
    const plainProfile = new TestProfile('123', 'John Doe', 'private data', 'john@example.com', 'system metadata');
    const anyValue = AnyValue.from(plainProfile);

    expect(isOk(anyValue)).toBe(true);
    if (isErr(anyValue)) return;

    // Test that we can request different types and get proper typing
    const plainResult = anyValue.value.asType<TestProfile>();
    expect(isOk(plainResult)).toBe(true);
    if (isOk(plainResult)) {
      // plainResult.value is properly typed as TestProfile
      expect(plainResult.value.id).toBe('123');
      expect(plainResult.value.name).toBe('John Doe');
    }

    // This demonstrates that the dual-mode semantics work correctly
    // and that Result<T, Error> generics provide proper type safety
    // without needing type assertions
  });
});