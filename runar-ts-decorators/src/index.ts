import 'reflect-metadata';

export interface DecoratorMetadata {
  typeName: string;
  fields: Map<string, FieldMetadata>;
}

export interface FieldMetadata {
  typeName: string;
  isEncrypted: boolean;
  isPlain: boolean;
}

export interface EncryptedClassOptions {
  network: string;
  typeName?: string;
}

const metadataRegistry = new Map<string, DecoratorMetadata>();

export function EncryptedClass(options: EncryptedClassOptions) {
  return function (target: new (...args: any[]) => any) {
    const existing = metadataRegistry.get(target.name) || {
      typeName: options.typeName || target.name,
      fields: new Map(),
    };
    existing.typeName = options.typeName || target.name;
    metadataRegistry.set(target.name, existing);
  };
}

export function EncryptedField(options: { label: string }) {
  return function (target: any, propertyKey: string) {
    const className = target.constructor.name;
    const existing = metadataRegistry.get(className) || {
      typeName: className,
      fields: new Map(),
    };
    existing.fields.set(propertyKey, {
      typeName: options.label,
      isEncrypted: true,
      isPlain: false,
    });
    metadataRegistry.set(className, existing);
  };
}

export function PlainField() {
  return function (target: any, propertyKey: string) {
    const className = target.constructor.name;
    const existing = metadataRegistry.get(className) || {
      typeName: className,
      fields: new Map(),
    };
    existing.fields.set(propertyKey, {
      typeName: propertyKey,
      isEncrypted: false,
      isPlain: true,
    });
    metadataRegistry.set(className, existing);
  };
}

export function getMetadata(className: string): DecoratorMetadata | undefined {
  return metadataRegistry.get(className);
}

export function getFieldMetadata(target: new (...args: any[]) => any): FieldMetadata[] {
  const className = target.name;
  const metadata = metadataRegistry.get(className);
  if (!metadata) return [];
  return Array.from(metadata.fields.values());
}

export function getEncryptedClassOptions(
  target: new (...args: any[]) => any
): EncryptedClassOptions | undefined {
  const className = target.name;
  const metadata = metadataRegistry.get(className);
  if (!metadata) return undefined;
  // For now, return a default since we don't store the options
  return { network: 'default' };
}

export function getTypeName(target: new (...args: any[]) => any): string | undefined {
  const className = target.name;
  const metadata = metadataRegistry.get(className);
  return metadata?.typeName;
}
