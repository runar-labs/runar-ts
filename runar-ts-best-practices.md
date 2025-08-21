# Runar TypeScript Framework - Best Practices & Usage Guide

This document outlines the correct patterns and best practices for using the Runar TypeScript framework. It serves as a reference to ensure code quality, maintainability, and 100% compatibility with the Rust implementation.

## 🚀 Core Principles

### 1. No Fallbacks - Single Path Execution

- **❌ WRONG**: Try one type, fallback to another
- **✅ CORRECT**: Expect exact type, fail if mismatch

```typescript
// ❌ BAD - Fallback pattern
const stringResult = req.payload.as<string>();
let label = '';
if (stringResult.ok) {
  label = stringResult.value;
} else {
  // Fallback - TERRIBLE PRACTICE
  const bytesResult = req.payload.as<Uint8Array>();
  if (bytesResult.ok) {
    label = new TextDecoder().decode(bytesResult.value);
  }
}

// ✅ GOOD - Single path, clear expectations
const stringResult = req.payload.as<string>();
if (!stringResult.ok) {
  return err('Expected string payload for label');
}
const label = stringResult.value;
```

### 2. Action Handlers - Clean & Simple

Action handlers should be pure functions that:

- Receive `AnyValue` payload directly
- Return `Result<AnyValue, string>` only
- Never deal with serialization, request IDs, or internal concerns

```typescript
// ❌ BAD - Complex handler with internal details
async (req: ActionRequest) => {
  // Don't deal with requestId
  // Don't do fallbacks
  return { ok: true, requestId: req.requestId, payload: AnyValue.from(result) };
};

// ✅ GOOD - Clean handler matching Rust API
async (payload: AnyValue, context: RequestContext): Promise<Result<AnyValue, string>> => {
  const stringResult = payload.as<string>();
  if (!stringResult.ok) {
    return err('Expected string payload');
  }

  const result = await processData(stringResult.value);
  return ok(AnyValue.from(result));
};
```

### 3. Type Safety - No `unknown`

Always use specific types, never `as<unknown>()`:

```typescript
// ❌ BAD
const result = payload.as<unknown>();

// ✅ GOOD
const result = payload.as<string>();
// or
const result = payload.as<MyStruct>();
```

## 📋 API Alignment with Rust

### Action Handler Signature (Must Match Exactly)

```typescript
type ActionHandler = (
  payload: AnyValue,
  context: RequestContext
) => Promise<Result<AnyValue, string>>;
```

**Parameters**:

- `payload: AnyValue` - The input data (already deserialized by framework)
- `context: RequestContext` - Request context (not ActionRequest)

**Returns**:

- `Promise<Result<AnyValue, string>>` - Either success with AnyValue or error message

### LifecycleContext Methods (Must Match Rust)

```typescript
interface LifecycleContext {
  // Action registration
  registerAction(actionName: string, handler: ActionHandler): Promise<Result<void, string>>;

  // Request/Response
  request(topic: string, payload?: AnyValue): Promise<Result<AnyValue, string>>;

  // Event publishing
  publish(topic: string, data?: AnyValue): Promise<Result<void, string>>;

  // Event subscription
  on(topic: string, options?: OnOptions): Promise<Result<AnyValue | undefined, string>>;
  subscribe(
    topic: string,
    callback: EventHandler,
    options?: SubscribeOptions
  ): Promise<Result<string, string>>;
  unsubscribe(subscriptionId: string): Promise<Result<void, string>>;
}
```

## 🔧 Framework Responsibilities

### What the Framework Does:

- **Serialization/Deserialization**: Automatically handles CBOR conversion at wire boundaries
- **Encryption/Decryption**: Automatically handles encryption for remote calls
- **Network Transport**: Handles local vs remote routing
- **Request ID Management**: Internal concern, never exposed to action handlers
- **Type Safety**: Ensures type correctness at runtime

### What Action Handlers Should Do:

- **Business Logic Only**: Pure functions implementing business rules
- **Type Checking**: Use `AnyValue.as<T>()` to extract expected types
- **Error Handling**: Return `Result` with descriptive error messages
- **Simple Returns**: Return `AnyValue` results directly

## 📝 Common Patterns

### 1. String Input Handler

```typescript
const myAction: ActionHandler = async (payload, context) => {
  const stringResult = payload.as<string>();
  if (!stringResult.ok) {
    return err('Expected string payload');
  }

  const result = await processString(stringResult.value);
  return ok(AnyValue.from(result));
};
```

### 2. JSON Object Input Handler

```typescript
interface MyInput {
  name: string;
  count: number;
}

const myAction: ActionHandler = async (payload, context) => {
  const inputResult = payload.as<MyInput>();
  if (!inputResult.ok) {
    return err('Expected MyInput object');
  }

  const input = inputResult.value;
  const result = await processInput(input.name, input.count);
  return ok(AnyValue.from(result));
};
```

### 3. Error Handling Pattern

```typescript
const myAction: ActionHandler = async (payload, context) => {
  // Validate input
  const input = payload.as<string>();
  if (!input.ok) {
    return err('Invalid input: expected string');
  }

  // Process with potential business errors
  try {
    const result = await riskyBusinessLogic(input.value);
    return ok(AnyValue.from(result));
  } catch (error) {
    return err(`Business logic failed: ${error.message}`);
  }
};
```

## 🚫 Anti-Patterns to Avoid

### 1. Fallback Logic

```typescript
// ❌ NEVER DO THIS
const stringResult = payload.as<string>();
if (stringResult.ok) {
  return ok(AnyValue.from(stringResult.value));
} else {
  const bytesResult = payload.as<Uint8Array>();
  if (bytesResult.ok) {
    return ok(AnyValue.from(new TextDecoder().decode(bytesResult.value)));
  }
}
```

### 2. Manual Serialization

```typescript
// ❌ NEVER DO THIS
const myAction = async req => {
  const input = AnyValue.fromBytes(req.payload); // Framework handles this
  // ... process
  return { ok: true, payload: result.serialize() }; // Framework handles this
};
```

### 3. Request ID Handling

```typescript
// ❌ NEVER DO THIS
const myAction = async req => {
  return {
    ok: true,
    requestId: req.requestId, // Internal concern
    payload: AnyValue.from(result),
  };
};
```

### 4. Complex Return Types

```typescript
// ❌ NEVER DO THIS
const myAction = async req => {
  return {
    status: 'success',
    data: result,
    timestamp: Date.now(),
    requestId: req.requestId,
  };
};
```

## 🧪 Testing Best Practices

TODO: fix this recomendation.. the issue with this recomendation is that
thios is only useful to test an action that does not call any other action..
and this is rare..
the best practice to test an action is to crete a offline node
add the serbice to be tests and all toher services neede from the action being tets..
and call the action throug th node api.. this way the action gets a proper context.. not a modk.. an can call other actions...
that is the recomended way to test actions.. is also fast an lightweight..
but allows for real tests involved all the actions and events needes..
user can sstul do this with mocks. if they choose to.. but shuold not
be our recomended approach.. so keep this as an example of a putre unite test of an action with mockis.. so useers now is possible. BUT This is not our recomended approach.. specialyu for our tests.. out test should enver use mocks..
and show our recomended approach.. like we do all our tests in rust.

### Test Action Handlers Like This:

```typescript
describe('myAction', () => {
  it('should process string input correctly', async () => {
    const payload = AnyValue.from('test input');
    const context = createMockContext();

    const result = await myAction(payload, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const output = result.value.as<string>();
      expect(output.ok).toBe(true);
      expect(output.value).toBe('processed: test input');
    }
  });

  it('should reject non-string input', async () => {
    const payload = AnyValue.from(123);
    const context = createMockContext();

    const result = await myAction(payload, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Expected string payload');
    }
  });
});
```

## 📚 Key Takeaways

1. **Single Path**: Always expect exact types, fail on mismatch
2. **Clean Handlers**: Only business logic, no infrastructure concerns
3. **Framework Trust**: Trust framework for serialization, networking, IDs
4. **Type Safety**: Use specific types, never `unknown`
5. **Error Clarity**: Return descriptive error messages
6. **API Alignment**: Match Rust signatures exactly
7. **No Fallbacks**: Predictable, deterministic execution paths

## 🔍 Debugging Tips

- **Type Mismatches**: Check if you're using the right `AnyValue.as<T>()` call
- **Serialization Issues**: Framework handles this - don't touch bytes manually
- **Network Errors**: Check if service is registered and paths are correct
- **Handler Not Called**: Verify action registration succeeded

---

_This document should be updated as new patterns emerge or requirements change._
