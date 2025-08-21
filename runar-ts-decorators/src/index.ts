import 'reflect-metadata';

export type EncryptedClassOptions = { network?: string; typeName?: string };
export type EncryptedFieldOptions = { label?: string; profileRecipients?: () => Uint8Array[] };

const CLASS_META_KEY = Symbol.for('runar.encrypted.class');
const FIELD_META_KEY = Symbol.for('runar.encrypted.field');

export function EncryptedClass(options?: EncryptedClassOptions): ClassDecorator {
  return target => {
    Reflect.defineMetadata(CLASS_META_KEY, options ?? {}, target);
  };
}

export function EncryptedField(options?: EncryptedFieldOptions): PropertyDecorator {
  return (target, propertyKey) => {
    const ctor = target.constructor;
    const existing: Array<{ key: string | symbol; options?: EncryptedFieldOptions }> =
      Reflect.getMetadata(FIELD_META_KEY, ctor) ?? [];
    existing.push({ key: propertyKey, options });
    Reflect.defineMetadata(FIELD_META_KEY, existing, ctor);
  };
}

export function PlainField(): PropertyDecorator {
  return (target, propertyKey) => {
    const ctor = target.constructor;
    const existing: Array<{ key: string | symbol; plain: true }> =
      Reflect.getMetadata(FIELD_META_KEY, ctor) ?? [];
    existing.push({ key: propertyKey, plain: true });
    Reflect.defineMetadata(FIELD_META_KEY, existing, ctor);
  };
}

export function getEncryptedClassOptions(ctor: Function): EncryptedClassOptions | undefined {
  return Reflect.getMetadata(CLASS_META_KEY, ctor);
}

export function getFieldMetadata(ctor: Function): Array<any> {
  return Reflect.getMetadata(FIELD_META_KEY, ctor) ?? [];
}

export function getTypeName(ctor: Function): string | undefined {
  const opts: EncryptedClassOptions | undefined = Reflect.getMetadata(CLASS_META_KEY, ctor);
  return opts?.typeName;
}
