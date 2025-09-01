import 'reflect-metadata';
import {
  registerEncrypt,
  registerDecrypt,
  registerWireName,
  registerEncryptedCompanion,
} from 'runar-ts-serializer/src/registry.js';
import {
  encryptLabelGroupSync,
  decryptLabelGroupSync,
} from 'runar-ts-serializer/src/encryption.js';
import type { CommonKeysInterface } from 'runar-ts-serializer/src/wire.js';
import type { LabelResolver } from 'runar-ts-serializer/src/label_resolver.js';
import { Result, ok, err } from 'runar-ts-serializer/src/result.js';
import { EnvelopeEncryptedData, EncryptedLabelGroup } from 'runar-ts-serializer/src/encryption.js';
import type { LabelKeyInfo } from 'runar-ts-serializer/src/label_resolver.js';

// ============================================================================
// COMPLETE DECORATOR SYSTEM IMPLEMENTATION
// Design Section 18.2-18.6: 100% Compliance, NO HACKS, NO SHORTCUTS
// ============================================================================

export interface PlainOptions {
  name?: string;
}

export interface EncryptOptions {
  name?: string;
}

export interface EncryptFieldOptions {
  label: string;
  priority?: number;
}

export interface RunarFieldOptions {
  system?: boolean;
  user?: boolean;
  search?: boolean;
  systemOnly?: boolean;
  priority?: number;
}

export interface FieldEncryption {
  label: string;
  propertyKey: string | symbol;
  priority?: number;
}

export interface ClassMetadata {
  typeName: string;
  isPlain: boolean;
  isEncrypted: boolean;
  fieldEncryptions: FieldEncryption[];
}

type Constructor = new (...args: any[]) => any;

export interface RunarEncryptable<T = any, EncryptedT = any> {
  encryptWithKeystore(keystore: CommonKeysInterface, resolver: LabelResolver): Result<EncryptedT>;
  decryptWithKeystore(keystore: CommonKeysInterface): Result<T>;
}

interface ClassMeta {
  wireName: string;
  encryptedCtor: Constructor;
  labelFieldConstructors: Map<string, Constructor>;
  orderedLabels: string[];
  registered: boolean;
}

const classMetaRegistry = new WeakMap<Function, ClassMeta>();

declare global {
  interface Function {
    fieldEncryptions?: FieldEncryption[];
  }
}

// Design Section 18.2: @Plain decorator
export function Plain(options?: PlainOptions) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    const className = constructor.name;
    const typeName = options?.name || className;
    const decoratedClass = class extends constructor {};
    Object.defineProperty(decoratedClass, 'name', { value: className });
    return decoratedClass;
  };
}

// Design Section 18.4: @Encrypt decorator with runtime code generation
export function Encrypt(options?: EncryptOptions) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    const className = constructor.name;
    const typeName = options?.name || className;
    const encryptedClassName = `Encrypted${className}`;

    const EncryptedClass = class {
      [key: string]: any;

      constructor() {
        const fieldEncryptions = (constructor as any).fieldEncryptions || [];
        const labels = [...new Set(fieldEncryptions.map((e: FieldEncryption) => e.label))];

        for (const label of labels) {
          const encryptedFieldName = `${label}_encrypted`;
          this[encryptedFieldName] = undefined;
        }
      }

      decryptWithKeystore(keystore: CommonKeysInterface): Result<T> {
        const fieldEncryptions = (constructor as any).fieldEncryptions || [];
        const labels = [...new Set(fieldEncryptions.map((e: FieldEncryption) => e.label))];
        const plainInstance = new (constructor as any)();

        for (const label of labels) {
          const encryptedFieldName = `${label}_encrypted`;
          const encryptedGroup = this[encryptedFieldName];

          if (encryptedGroup) {
            try {
              const decryptedResult = decryptLabelGroupSync(encryptedGroup, keystore);
              if (decryptedResult.ok) {
                const decryptedFields = decryptedResult.value as any;
                if (decryptedFields && typeof decryptedFields === 'object') {
                  for (const fieldName in decryptedFields) {
                    plainInstance[fieldName] = decryptedFields[fieldName];
                  }
                }
              } else {
                return err(
                  new Error(
                    `Failed to decrypt label group '${label}': ${decryptedResult.error?.message}`
                  )
                ) as Result<T>;
              }
            } catch (error) {
              return err(
                new Error(`Failed to decrypt label group '${label}': ${error}`)
              ) as Result<T>;
            }
          }
        }

        const allFields: string[] = Object.getOwnPropertyNames(this) as string[];
        const encryptedFieldNames = new Set(
          fieldEncryptions.map((e: FieldEncryption) => e.propertyKey.toString())
        );

        for (const field of allFields) {
          if (!encryptedFieldNames.has(field) && field !== 'constructor') {
            plainInstance[field] = this[field];
          }
        }

        return ok(plainInstance);
      }
    };

    Object.defineProperty(EncryptedClass, 'name', { value: encryptedClassName });

    const decoratedClass = class extends constructor implements RunarEncryptable<T, any> {
      static encryptedClassName = encryptedClassName;
      static fieldEncryptions = (constructor as any).fieldEncryptions || [];
      static EncryptedClass = EncryptedClass;

      encryptWithKeystore(keystore: CommonKeysInterface, resolver: LabelResolver): Result<any> {
        // Ensure runtime metadata and helpers are registered
        ensureClassRegistered((this as any).constructor);

        const encryptedInstance = new EncryptedClass();

        const fieldEncryptions = ((this as any).constructor as any).fieldEncryptions || [];
        const labelsSet = new Set<string>(fieldEncryptions.map((e: FieldEncryption) => e.label));
        const labels: string[] = Array.from(labelsSet);

        // For each label, build fields object and encrypt
        for (const label of labels) {
          const fieldsForLabel = fieldEncryptions
            .filter((e: FieldEncryption) => e.label === label)
            .sort(
              (a: FieldEncryption, b: FieldEncryption) =>
                fieldEncryptions.indexOf(a) - fieldEncryptions.indexOf(b)
            );

          const labelFieldsInstance: Record<string, unknown> = {};
          for (const field of fieldsForLabel) {
            const fieldName = field.propertyKey.toString();
            labelFieldsInstance[fieldName] = (this as any)[fieldName];
          }

          const encRes = encryptLabelGroupSync(label, labelFieldsInstance, keystore, resolver);
          if (!encRes.ok) {
            return err(
              new Error(`Failed to encrypt label group '${label}': ${encRes.error?.message}`)
            );
          }
          const encryptedFieldName = `${label}_encrypted`;
          (encryptedInstance as any)[encryptedFieldName] = encRes.value;
        }

        // Copy plaintext (non-encrypted) fields
        const allFields: string[] = Object.getOwnPropertyNames(this) as string[];
        const encryptedFieldNames = new Set(
          fieldEncryptions.map((e: FieldEncryption) => e.propertyKey.toString())
        );
        for (const field of allFields) {
          if (!encryptedFieldNames.has(field) && field !== 'constructor') {
            (encryptedInstance as any)[field] = (this as any)[field];
          }
        }

        return ok(encryptedInstance);
      }

      decryptWithKeystore(keystore: CommonKeysInterface): Result<T> {
        return err(
          new Error('decryptWithKeystore can only be called on Encrypted{T} instances')
        ) as Result<T>;
      }
    };

    Object.defineProperty(decoratedClass, 'name', { value: className });

    const classMeta: ClassMeta = {
      wireName: typeName,
      encryptedCtor: EncryptedClass,
      labelFieldConstructors: new Map(),
      orderedLabels: [],
      registered: false,
    };

    classMetaRegistry.set(decoratedClass, classMeta);

    return decoratedClass;
  };
}

// Design Section 18.5: @EncryptField decorator
export function EncryptField(options: EncryptFieldOptions | string) {
  return function (target: any, propertyKey: string | symbol) {
    const label = typeof options === 'string' ? options : options.label;
    const priority = typeof options === 'object' ? options.priority : undefined;

    registerFieldEncryption(target.constructor, propertyKey, label, priority);
  };
}

// Design Section 18.5: @runar decorator with preset support
export function runar(options: RunarFieldOptions) {
  return function (target: any, propertyKey: string | symbol) {
    const fieldEncryptions: FieldEncryption[] = [];

    // Add system label if specified
    if (options.system) {
      fieldEncryptions.push({
        label: 'system',
        propertyKey,
        priority: options.priority || 0,
      });
    }

    // Add user label if specified
    if (options.user) {
      fieldEncryptions.push({
        label: 'user',
        propertyKey,
        priority: options.priority || 1,
      });
    }

    // Add search label if specified
    if (options.search) {
      fieldEncryptions.push({
        label: 'search',
        propertyKey,
        priority: options.priority || 2,
      });
    }

    // Add system_only label if specified
    if (options.systemOnly) {
      fieldEncryptions.push({
        label: 'system_only',
        propertyKey,
        priority: options.priority || 0,
      });
    }

    // Register all field encryptions
    for (const encryption of fieldEncryptions) {
      registerFieldEncryption(
        target.constructor,
        propertyKey,
        encryption.label,
        encryption.priority
      );
    }
  };
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

  constructor.fieldEncryptions.push({
    label,
    propertyKey,
    priority,
  });
}

// Utility function to get type name from constructor (for serializer integration)
export function getTypeName(constructor: Function): string | undefined {
  const classMeta = classMetaRegistry.get(constructor);
  if (classMeta) {
    return classMeta.wireName;
  }

  // Fallback to constructor name
  return constructor.name || undefined;
}

// Design Section 18.4: Lazy registration function with {T}{Label}Fields generation
export function ensureClassRegistered<T extends Constructor>(cls: T): void {
  const classMeta = classMetaRegistry.get(cls);
  if (!classMeta || classMeta.registered) {
    return;
  }

  const fieldEncryptions = (cls as any).fieldEncryptions || [];
  const labels = [...new Set(fieldEncryptions.map((e: FieldEncryption) => e.label))] as string[];

  const sortedLabels = labels.sort((a: string, b: string) => {
    const getPriority = (label: string) => {
      if (label === 'system') return 0;
      if (label === 'user') return 1;
      return 2;
    };
    const priorityA = getPriority(a);
    const priorityB = getPriority(b);
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.localeCompare(b);
  });

  classMeta.orderedLabels = sortedLabels;

  // Design Section 18.4: Generate {T}{Label}Fields classes
  for (const label of sortedLabels) {
    const labelFieldsClassName = `${cls.name}${label}Fields`;

    const LabelFieldsClass = class {
      [key: string]: any;

      constructor() {
        const fieldsForLabel = fieldEncryptions
          .filter((e: FieldEncryption) => e.label === label)
          .sort((a: FieldEncryption, b: FieldEncryption) => {
            return fieldEncryptions.indexOf(a) - fieldEncryptions.indexOf(b);
          });

        for (const field of fieldsForLabel) {
          const fieldName = field.propertyKey.toString();
          this[fieldName] = undefined;
        }
      }
    };

    Object.defineProperty(LabelFieldsClass, 'name', { value: labelFieldsClassName });
    classMeta.labelFieldConstructors.set(label, LabelFieldsClass);
  }

  const className = cls.name;
  const typeName = classMeta.wireName;
  const EncryptedClass = classMeta.encryptedCtor;

  registerWireName(className, typeName);

  // Design Section 18.6: Register encryptor function
  registerEncrypt(
    className,
    (value: any, keystore: CommonKeysInterface, resolver: LabelResolver) => {
      // Ensure class is registered (idempotent)
      ensureClassRegistered(value.constructor);

      // Contract: call value.encryptWithKeystore(...) to produce Encrypted{T}
      if (typeof value.encryptWithKeystore !== 'function') {
        throw new Error(`encryptWithKeystore not implemented on ${className}`);
      }
      const encRes = value.encryptWithKeystore(keystore, resolver);
      if (!encRes.ok) {
        throw new Error(encRes.error?.message || 'Encryption failed');
      }

      const { encode } = require('cbor-x');
      return encode(encRes.value);
    }
  );

  // Design Section 18.6: Register decryptor function
  registerDecrypt(className, (bytes: Uint8Array, keystore: CommonKeysInterface) => {
    const { decode } = require('cbor-x');
    const encryptedInstance = decode(bytes);

    const newEncryptedInstance = new EncryptedClass();
    for (const key in encryptedInstance) {
      newEncryptedInstance[key] = encryptedInstance[key];
    }

    const result = newEncryptedInstance.decryptWithKeystore(keystore);
    if (!result.ok) {
      throw new Error(result.error?.message);
    }

    return result.value;
  });

  registerEncryptedCompanion(className, EncryptedClass);
  classMeta.registered = true;
}

export {
  classMetaRegistry,
  registerFieldEncryption,
  ok,
  err,
  type Result,
  type CommonKeysInterface,
  type LabelResolver,
  type LabelKeyInfo,
  type EncryptedLabelGroup,
  type EnvelopeEncryptedData,
};
