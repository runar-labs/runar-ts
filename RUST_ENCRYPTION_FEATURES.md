# Runar Rust Encryption & Serialization Features Analysis

## Overview

This document provides a comprehensive analysis of the Rust `runar-serializer-macros` system and maps each feature to potential TypeScript decorator implementations. The analysis is based on line-by-line code review of the macro implementation and extensive test coverage.

## 1. Rust Feature Analysis

### 1.1 Plain Derive Macro (`#[derive(Plain)]`)

**Purpose**: Zero-copy conversion between user types and `ArcValue` for efficient serialization.

**Code Analysis** (`lib.rs` lines 52-95):

```rust
#[proc_macro_derive(Plain, attributes(runar))]
pub fn derive_plain(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let struct_name = input.ident.clone();
    let wire_name_literal = extract_wire_name(&input.attrs, &struct_name);

    let expanded = quote! {
        impl runar_serializer::traits::RunarEncryptable for #struct_name {}

        impl runar_serializer::traits::RunarEncrypt for #struct_name {
            type Encrypted = #struct_name;

            fn encrypt_with_keystore(
                &self,
                _keystore: &std::sync::Arc<runar_serializer::KeyStore>,
                _resolver: &dyn runar_serializer::LabelResolver,
            ) -> anyhow::Result<Self::Encrypted> {
                Ok(self.clone())
            }
        }

        impl runar_serializer::traits::RunarDecrypt for #struct_name {
            type Decrypted = #struct_name;

            fn decrypt_with_keystore(
                &self,
                _keystore: &std::sync::Arc<runar_serializer::KeyStore>,
            ) -> anyhow::Result<Self::Decrypted> {
                Ok(self.clone())
            }
        }

        // Automatically register JSON converter and wire name for this struct at program start.
        const _: () = {
            #[ctor::ctor]
            fn register_json_converter() {
                runar_serializer::registry::register_to_json::<#struct_name>();
                runar_serializer::registry::register_type_name::<#struct_name>(#wire_name_literal);
            }
        };
    };
}
```

**Key Features**:
- Implements `RunarEncryptable`, `RunarEncrypt`, and `RunarDecrypt` traits
- No-op encryption (returns self.clone())
- Auto-registration via `ctor` crate for JSON conversion and wire name
- Supports custom wire names via `#[runar(name = "custom_name")]`

**Test Evidence** (`basic_serialization_test.rs`, `arc_value_test.rs`):
- Zero-copy serialization/deserialization
- Automatic JSON conversion registration
- Type-safe primitive serialization (String, i64, bool)
- Container types (List, Map, Bytes, Json)
- Null value handling

### 1.2 Encrypt Derive Macro (`#[derive(Encrypt)]`)

**Purpose**: Generates encrypted companion structs with field-level encryption based on labels.

**Code Analysis** (`lib.rs` lines 97-318):

**Core Logic (lines 104-151)**:
```rust
let mut plaintext_fields: Vec<(Ident, Type)> = Vec::new();
let mut label_groups: std::collections::BTreeMap<String, Vec<(Ident, Type)>> = std::collections::BTreeMap::new();

if let Data::Struct(ds) = input.data {
    for field in named.named.iter() {
        let labels = field.attrs.iter()
            .flat_map(parse_runar_labels)
            .collect::<Vec<_>>();
        if labels.is_empty() {
            plaintext_fields.push((field_ident, field_ty));
        } else {
            for label in labels {
                label_groups.entry(label).or_default().push((field_ident.clone(), field_ty.clone()));
            }
        }
    }
}

// Label ordering for consistent encryption
label_order.sort_by(|a, b| {
    let rank = |l: &String| match l.as_str() {
        "system" => 0,
        "user" => 1,
        _ => 2,
    };
    rank(a).cmp(&rank(b)).then_with(|| a.cmp(b))
});
```

**Label Processing (lines 159-203)**:
- Groups fields by encryption labels
- Creates sub-structs for each label group
- Generates encryption/decryption logic per label
- Handles label resolution and key lookup

**Encrypted Struct Generation (lines 209-243)**:
```rust
let encrypted_struct_def = quote! {
    #[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
    pub struct #encrypted_name {
        #(#proto_plaintext_fields)*
        #(#enc_label_tokens)*
    }
};
```

**Encryption/Decryption Implementation (lines 248-293)**:
- `RunarEncrypt` trait implementation
- `RunarDecrypt` trait implementation
- Field-level encryption using `encrypt_label_group`
- Label-based decryption with access control

**Auto-Registration (lines 295-315)**:
```rust
const _: () = {
    #[ctor::ctor]
    fn register_decryptor() {
        runar_serializer::registry::register_decrypt::<#struct_name, #encrypted_name>();
        runar_serializer::registry::register_type_name::<#struct_name>(#wire_name_literal);
        runar_serializer::registry::register_encrypt::<#struct_name, #encrypted_name>();
    }
};
```

**Supported Labels** (from `encryption_test.rs`):
- `#[runar(user)]`: Encrypted with user profile keys
- `#[runar(system)]`: Encrypted with network/system keys
- `#[runar(search)]`: Search index copy (encrypted)
- `#[runar(system_only)]`: System/network context only

LABELS are developer defined, and later mapped to actual public keys using the label resolver. 
so these values ehre user, system etc.. are jsut an example, but the dveloper can use any string they want to define a label.

### 1.3 @runar Attribute Macro

**Purpose**: No-op attribute macro for field annotations.

**Code Analysis** (`lib.rs` lines 326-330):
```rust
#[proc_macro_attribute]
pub fn runar(_attr: TokenStream, item: TokenStream) -> TokenStream {
    item
}
```

**Purpose**: Allows `#[runar(user)]`, `#[runar(name = "custom")]`, etc. without compilation errors.

### 1.4 Wire Name Extraction

**Code Analysis** (`lib.rs` lines 29-50):
```rust
fn extract_wire_name(attrs: &[Attribute], default_ident: &Ident) -> proc_macro2::TokenStream {
    for attr in attrs.iter() {
        if attr.path().is_ident("runar") {
            let _ = attr.parse_nested_meta(|meta| {
                if meta.path.is_ident("name") {
                    let lit: syn::LitStr = meta.value()?.parse()?;
                    wire_name = Some(lit.value());
                }
                Ok(())
            });
        }
    }
    // Returns literal for use in registration
}
```

### 1.5 Label Parsing

**Code Analysis** (`lib.rs` lines 8-15):
```rust
fn parse_runar_labels(attr: &Attribute) -> Vec<String> {
    if !attr.path().is_ident("runar") {
        return vec![];
    }
    let parsed: Punctuated<Ident, Comma> =
        attr.parse_args_with(Punctuated::parse_terminated).unwrap();
    parsed.iter().map(|ident| ident.to_string()).collect()
}
```

### 1.6 Test Evidence Analysis

**Encryption Test (`encryption_test.rs`)**:

**Test Structure (lines 17-29)**:
```rust
#[derive(Clone, PartialEq, Debug, serde::Serialize, serde::Deserialize, Encrypt)]
#[runar(name = "encryption_test.TestProfile")]
pub struct TestProfile {
    pub id: String,
    #[runar(system)]
    pub name: String,
    #[runar(user)]
    pub private: String,
    #[runar(search)]
    pub email: String,
    #[runar(system_only)]
    pub system_metadata: String,
}
```

**Key Insights**:
- Mixed encryption levels on single struct
- Custom wire name specification
- Label-based access control testing
- Mobile vs Node keystore access patterns

**Encryption Flow (lines 122-150)**:
1. Create original struct instance
2. Call `encrypt_with_keystore()` with keystore and resolver
3. Returns `EncryptedTestProfile` with encrypted fields
4. Decrypt with appropriate keystore based on access level

**Access Control Testing**:
- Mobile keystore: Can access user fields, cannot access system_only
- Node keystore: Can access system fields, cannot access user fields
- Label resolver determines which keys can decrypt which fields

## 2. TypeScript Decorator Mapping

### 2.1 @Plain Decorator

**Purpose**: Mark classes for zero-copy serialization without encryption.

**TypeScript Implementation**:
```typescript
interface PlainOptions {
  name?: string;
}

function Plain(options?: PlainOptions) {
  return function<T extends { new(...args: any[]): {} }>(constructor: T) {
    // Register for JSON conversion
    AnyValue.registerJsonConverter(constructor, options?.name || constructor.name);

    // Mark as RunarEncryptable
    (constructor as any).isRunarEncryptable = true;

    return class extends constructor {
      encryptWithKeystore(keystore: any, resolver: any) {
        return this; //NOTE close is a RUST specific feature not needed in TS
      }

      decryptWithKeystore(keystore: any) {
        return this;
      }
    };
  };
}
```

**Usage**:
```typescript
@Plain({ name: "custom.TestStructAB" })
class TestStruct {
  constructor(public a: number, public b: string) {}
}
```

### 2.2 @Encrypt Decorator

**Purpose**: Generate encrypted companion class with field-level (grouped  by labels) encryption.

**TypeScript Implementation**:
```typescript
interface EncryptOptions {
  name?: string;
}

interface FieldEncryption {
  label: string;
  propertyKey: string | symbol;
}

function Encrypt(options?: EncryptOptions) {
  return function<T extends { new(...args: any[]): {} }>(constructor: T) {
    const encryptedClassName = `Encrypted${constructor.name}`;
    const fieldEncryptions: FieldEncryption[] = [];

    // Collect field encryption metadata
    const originalFields = Object.getOwnPropertyNames(new constructor());

    return class extends constructor {
      static encryptedClassName = encryptedClassName;
      static fieldEncryptions = fieldEncryptions;

      // Encryption method
      encryptWithKeystore(keystore: any, resolver: any) {
        const encrypted = new (globalThis[encryptedClassName])();

        // Copy plaintext fields (fields without encryption decorators)
        const plaintextFields = this.getPlaintextFields();
        for (const field of plaintextFields) {
          encrypted[field] = this[field];
        }

        // Group fields by label and encrypt each group
        const fieldsByLabel = getFieldsByLabel(this.constructor);
        const orderedLabels = getOrderedLabels(this.constructor);

        for (const label of orderedLabels) {
          if (resolver.canResolve(label)) {
            const fieldNames = fieldsByLabel.get(label) || [];

            // Create sub-struct for this label group
            const labelGroupData: any = {};
            for (const fieldName of fieldNames) {
              labelGroupData[fieldName] = this[fieldName];
            }

            const encryptedGroup = encryptLabelGroup(
              label,
              labelGroupData,
              keystore,
              resolver
            );
            encrypted[`${label}_encrypted`] = encryptedGroup;
          } else {
            encrypted[`${label}_encrypted`] = null;
          }
        }

        return encrypted;
      }

      // Decryption method (for encrypted companion class)
      decryptWithKeystore(keystore: any) {
        const decrypted = new constructor();

        // Copy plaintext fields
        const plaintextFields = this.getPlaintextFields();
        for (const field of plaintextFields) {
          decrypted[field] = this[field];
        }

        // Decrypt labeled field groups
        const orderedLabels = getOrderedLabels(this.constructor);

        for (const label of orderedLabels) {
          const encryptedField = `${label}_encrypted`;
          if (this[encryptedField]) {
            try {
              const decryptedGroup = decryptLabelGroup(
                this[encryptedField],
                keystore
              );

              // Distribute decrypted fields back to the object
              if (decryptedGroup && typeof decryptedGroup === 'object') {
                for (const [fieldName, fieldValue] of Object.entries(decryptedGroup)) {
                  decrypted[fieldName] = fieldValue;
                }
              }
            } catch (e) {
              // Fields remain as default values if decryption fails
              const fieldsByLabel = getFieldsByLabel(this.constructor);
              const fieldNames = fieldsByLabel.get(label) || [];
              for (const fieldName of fieldNames) {
                decrypted[fieldName] = getDefaultValue(fieldName);
              }
            }
          }
        }

        return decrypted;
      }

      // Helper methods (need to be implemented)
      private getPlaintextFields(): string[] {
        const allFields = Object.getOwnPropertyNames(this);
        const encryptedFields = this.constructor.fieldEncryptions || [];
        const encryptedFieldNames = new Set(encryptedFields.map((e: any) => e.propertyKey.toString()));

        return allFields.filter(field => !encryptedFieldNames.has(field) && field !== 'constructor');
      }
    };
  };
}
```

### 2.3 Field-Level Encryption Decorators

**Purpose**: Mark individual fields for encryption with specific labels.

**Key Design Principle**: Labels are developer-defined strings, not hardcoded decorator names.

**Correct TypeScript Implementation**:

```typescript
interface EncryptFieldOptions {
  label: string;  // The encryption label (e.g., "user", "system", "search", "system_only")
  priority?: number;  // Optional priority for label ordering (lower = higher priority)
}

// Generic field encryption decorator
function EncryptField(options: EncryptFieldOptions | string) {
  return function(target: any, propertyKey: string | symbol) {
    // Support both object and string syntax
    const label = typeof options === 'string' ? options : options.label;
    const priority = typeof options === 'object' ? options.priority : undefined;

    registerFieldEncryption(target.constructor, propertyKey, label, priority);
  };
}

// No convenience decorators - only the generic EncryptField decorator

interface FieldEncryption {
  label: string;
  propertyKey: string | symbol;
  priority?: number;
}

function registerFieldEncryption(
  constructor: Function,
  propertyKey: string | symbol,
  label: string,
  priority?: number
) {
  if (!constructor.fieldEncryptions) {
    constructor.fieldEncryptions = [];
  }
  constructor.fieldEncryptions.push({ label, propertyKey, priority });
}

// Helper to get fields grouped by label (mimics Rust's label_groups logic)
function getFieldsByLabel(constructor: Function): Map<string, string[]> {
  const fieldEncryptions: FieldEncryption[] = constructor.fieldEncryptions || [];
  const grouped = new Map<string, string[]>();

  for (const encryption of fieldEncryptions) {
    const properties = grouped.get(encryption.label) || [];
    properties.push(encryption.propertyKey.toString());
    grouped.set(encryption.label, properties);
  }

  return grouped;
}

// Get ordered labels for consistent encryption (mimics Rust's label_order logic)
function getOrderedLabels(constructor: Function): string[] {
  const fieldEncryptions: FieldEncryption[] = constructor.fieldEncryptions || [];

  // Extract unique labels
  const uniqueLabels = [...new Set(fieldEncryptions.map(e => e.label))];

  // Sort by priority first, then by label name
  return uniqueLabels.sort((a, b) => {
    // Find priorities (default to 2 if not specified)
    const aPriority = fieldEncryptions.find(e => e.label === a)?.priority ?? 2;
    const bPriority = fieldEncryptions.find(e => e.label === b)?.priority ?? 2;

    // Compare by priority first
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Then by label name
    return a.localeCompare(b);
  });
}

// Helper function to get default values for types
function getDefaultValue(fieldName: string): any {
  // In a real implementation, this would use reflection to determine
  // the appropriate default value based on the field's type
  // For now, return undefined (which will use the type's default)
  return undefined;
}
```

**Usage Examples**:

```typescript
// Example 1: Using generic decorator with custom labels
@Encrypt({ name: "encryption_test.TestProfile" })
class TestProfile {
  public id: string;

  @EncryptField('system')
  public name: string;

  @EncryptField('user')
  public private: string;

  @EncryptField('search')
  public email: string;

  @EncryptField('system_only')
  public systemMetadata: string;
}

// Example 2: Using @EncryptField with different label patterns
@Encrypt({ name: "encryption_test.TestProfile" })
class TestProfile {
  public id: string;

  @EncryptField('system')
  public name: string;

  @EncryptField('user')
  public private: string;

  @EncryptField('search')
  public email: string;

  @EncryptField('system_only')
  public systemMetadata: string;
}

// Example 3: Custom labels with priorities
@Encrypt({ name: "custom.TestStruct" })
class CustomStruct {
  public id: string;

  @EncryptField({ label: 'high_security', priority: 0 })
  public sensitiveData: string;

  @EncryptField({ label: 'medium_security', priority: 1 })
  public personalData: string;

  @EncryptField({ label: 'low_security', priority: 2 })
  public publicData: string;
}

// Example 4: Mixed encryption levels on single struct
@Encrypt({ name: "complex.EncryptedData" })
class ComplexData {
  // Plaintext fields (no encryption decorator)
  public id: string;
  public createdAt: Date;

  // Different encryption levels
  @EncryptField('network')  // Custom label
  public networkConfig: object;

  @EncryptField('user_profile')  // Custom label
  public userPreferences: object;

  @EncryptField('audit_log')  // Custom label
  public accessLogs: string[];
}
```

**Key Benefits**:
1. **Flexible Labels**: Developers can use any string as a label, not just hardcoded ones
2. **Grouping**: Fields with the same label are automatically grouped for encryption
3. **Priority System**: Control encryption order (mimics Rust's label ordering)
4. **Consistent API**: Single decorator pattern reduces confusion
5. **Extensible**: Easy to add new labels without changing decorator code



### 2.4 Label-Based Encryption System

**TypeScript Implementation**:

```typescript
interface LabelKeyInfo {
  profilePublicKeys: string[];
  networkId?: string;
}

interface KeyMappingConfig {
  labelMappings: Map<string, LabelKeyInfo>;
}

class ConfigurableLabelResolver {
  private config: KeyMappingConfig;

  constructor(config: KeyMappingConfig) {
    this.config = config;
  }

  canResolve(label: string): boolean {
    return this.config.labelMappings.has(label);
  }

  getKeyInfo(label: string): LabelKeyInfo | undefined {
    return this.config.labelMappings.get(label);
  }
}

interface EnvelopeCrypto {
  encrypt(data: Uint8Array, keyInfo: LabelKeyInfo): Promise<Uint8Array>;
  decrypt(data: Uint8Array, keyInfo: LabelKeyInfo): Promise<Uint8Array>;
}

interface EncryptedLabelGroup {
  label: string;
  encryptedData: Uint8Array;
  keyInfo: LabelKeyInfo;
}

// Encryption functions
async function encryptLabelGroup(
  label: string,
  data: any,
  keystore: EnvelopeCrypto,
  resolver: ConfigurableLabelResolver
): Promise<EncryptedLabelGroup | null> {
  if (!resolver.canResolve(label)) {
    return null;
  }

  const keyInfo = resolver.getKeyInfo(label);
  if (!keyInfo) {
    return null;
  }

  const serialized = AnyValue.from(data).serialize();
  const encrypted = await keystore.encrypt(serialized, keyInfo);

  return {
    label,
    encryptedData: encrypted,
    keyInfo
  };
}

async function decryptLabelGroup(
  encryptedGroup: EncryptedLabelGroup,
  keystore: EnvelopeCrypto
): Promise<any> {
  const decrypted = await keystore.decrypt(
    encryptedGroup.encryptedData,
    encryptedGroup.keyInfo
  );

  const arcValue = AnyValue.fromBytes(decrypted);
  return arcValue.asType();
}
```

### 2.5 Serialization Context

**TypeScript Implementation**:
```typescript
interface SerializationContext {
  keystore: EnvelopeCrypto;
  resolver: ConfigurableLabelResolver;
  networkId: string;
  profilePublicKey?: string;
}

// Enhanced AnyValue serialization
class AnyValue {
  static serializeWithEncryption(
    value: any,
    context?: SerializationContext
  ): Uint8Array {
    if (!context) {
      return this.serializeWithoutEncryption(value);
    }

    // Check if value is encryptable
    if (value.encryptWithKeystore) {
      const encrypted = value.encryptWithKeystore(context.keystore, context.resolver);
      return this.serializeWithoutEncryption(encrypted);
    }

    return this.serializeWithoutEncryption(value);
  }

  static deserializeWithDecryption(
    bytes: Uint8Array,
    keystore?: EnvelopeCrypto
  ): any {
    const arcValue = this.deserializeWithoutDecryption(bytes);

    if (!keystore) {
      return arcValue.asType();
    }

    // Check if it's an encrypted type and decrypt
    const value = arcValue.asType();
    if (value.decryptWithKeystore) {
      return value.decryptWithKeystore(keystore);
    }

    return value;
  }
}
```

### 2.6 Registry System

**TypeScript Implementation**:
```typescript
class TypeRegistry {
  private static jsonConverters = new Map<string, (data: any) => any>();
  private static typeNames = new Map<Function, string>();
  private static decryptors = new Map<string, (data: any, keystore: any) => any>();
  private static encryptors = new Map<string, (data: any, keystore: any, resolver: any) => any>();

  static registerJsonConverter(type: Function, converter: (data: any) => any) {
    this.jsonConverters.set(type.name, converter);
  }

  static registerTypeName(type: Function, wireName: string) {
    this.typeNames.set(type, wireName);
  }

  static registerDecryptor(plainType: string, encryptedType: string, decryptor: (data: any, keystore: any) => any) {
    this.decryptors.set(plainType, decryptor);
  }

  static registerEncryptor(plainType: string, encryptedType: string, encryptor: (data: any, keystore: any, resolver: any) => any) {
    this.encryptors.set(plainType, encryptor);
  }

  static getJsonConverter(typeName: string): ((data: any) => any) | undefined {
    return this.jsonConverters.get(typeName);
  }

  static getTypeName(type: Function): string | undefined {
    return this.typeNames.get(type);
  }

  static getDecryptor(plainType: string): ((data: any, keystore: any) => any) | undefined {
    return this.decryptors.get(plainType);
  }

  static getEncryptor(plainType: string): ((data: any, keystore: any, resolver: any) => any) | undefined {
    return this.encryptors.get(plainType);
  }
}
```

## 3. Implementation Strategy

### 3.1 Phase 1: Core Infrastructure

1. **Decorator Library Setup**:
   - Create `@runar/decorators` package
   - Implement base decorator infrastructure
   - Set up metadata reflection system

2. **Registry System**:
   - Implement TypeRegistry class
   - Add decorator auto-registration
   - Support for JSON converters and type names

3. **Encryption Interfaces**:
   - Define `EnvelopeCrypto` interface
   - Implement `ConfigurableLabelResolver`
   - Create `SerializationContext`

### 3.2 Phase 2: Field-Level Encryption

1. **Field Decorators**:
   - `@EncryptField('label')` with custom label strings
   - Field metadata collection system
   - Integration with encryption system

2. **Class Decorators**:
   - `@Plain` for simple serialization
   - `@Encrypt` for encrypted structs

### 3.3 Phase 3: Encryption System

1. **Core Encryption**:
   - `encryptLabelGroup` and `decryptLabelGroup` functions
   - Label-based access control
   - Error handling for decryption failures

2. **Enhanced AnyValue**:
   - `serializeWithEncryption` method
   - `deserializeWithDecryption` method
   - Context-aware serialization

### 3.4 Phase 4: Integration & Testing

1. **Integration**:
   - Wire with existing `AnyValue` system
   - Ensure compatibility with CBOR serialization
   - Maintain byte-for-byte compatibility

2. **Testing**:
   - Replicate all Rust test scenarios
   - Test cross-language compatibility
   - Performance benchmarking

## 4. Key Differences & Considerations

### 4.1 Runtime vs Compile-Time

**Rust**: Compile-time macro expansion generates code at build time
**TypeScript**: Runtime decorator execution with metadata collection

**Implication**: TypeScript needs runtime metadata reflection and registry systems

### 4.2 Type Safety

**Rust**: Strong compile-time guarantees
**TypeScript**: Runtime type checking and decorator validation

**Implication**: Need comprehensive runtime validation in decorators

### 4.3 Memory Management

**Rust**: Manual memory management, zero-copy operations
**TypeScript**: Garbage collection, object cloning

**Implication**: TypeScript will have more memory overhead, need optimization strategies

### 4.4 Serialization Format

**Rust**: Direct CBOR with custom binary format
**TypeScript**: Must match Rust's byte-for-byte format

**Implication**: Strict adherence to Rust's serialization format required

## 5. Migration Path

### 5.1 Step-by-Step Migration

1. **Start with Plain Types**:
   ```typescript
   @Plain()
   class SimpleStruct {
     constructor(public a: number, public b: string) {}
   }
   ```

2. **Add Field Encryption**:
   ```typescript
   @Encrypt()
   class UserProfile {
     public id: string;

     @EncryptField('system')
     public name: string;

     @EncryptField('user')
     public email: string;
   }
   ```

3. **Custom Wire Names**:
   ```typescript
   @Plain({ name: "custom.StructName" })
   class CustomStruct {
     // fields
   }
   ```

4. **Full Encryption**:
   ```typescript
   @Encrypt({ name: "encryption.TestProfile" })
   class TestProfile {
     public id: string;

     @EncryptField('system')
     public name: string;

     @EncryptField('user')
     public private: string;

     @EncryptField('search')
     public email: string;

     @EncryptField('system_only')
     public systemMetadata: string;
   }
   ```

This comprehensive analysis provides a solid foundation for implementing the Rust macro features in TypeScript using decorators, ensuring feature parity while respecting TypeScript's runtime nature and JavaScript's dynamic characteristics.
