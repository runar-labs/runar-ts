import type { CommonKeysInterface } from 'runar-ts-serializer/src/wire';
import type { LabelResolver } from 'runar-ts-serializer/src/label_resolver';
import { Result } from 'runar-ts-common/src/error/Result';
import { Logger } from 'runar-ts-common/src/logging/logger';
type ClassDecoratorContext = {
  name: string | symbol | undefined;
  kind: 'class';
};
type ClassFieldDecoratorContext<T, V> = {
  name: string | symbol;
  kind: 'field';
  addInitializer: (initializer: (this: T) => void) => void;
};
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
  decryptWithKeystore(keystore: CommonKeysInterface, logger?: Logger): Result<T>;
}
declare global {
  interface Function {
    fieldEncryptions?: FieldEncryption[];
  }
}
export declare function Plain(
  options?: PlainOptions
): (value: Function, context: ClassDecoratorContext) => void;
export declare function EncryptField(
  options: EncryptFieldOptions
): (initialValue: unknown, context: ClassFieldDecoratorContext<any, unknown>) => unknown;
export declare function Encrypt<T extends Constructor>(
  value: T,
  context: ClassDecoratorContext
): void;
export declare function runar(
  label: string
): <T, V>(initialValue: V, context: ClassFieldDecoratorContext<T, V>) => V;
export declare function ensureClassRegistered<T extends Constructor>(cls: T): void;
export declare function getTypeName(constructor: Function): string | undefined;
export type EncryptedClass<T> = T extends new (...args: any[]) => infer R
  ? new (...args: any[]) => R & {
      encryptWithKeystore(keystore: CommonKeysInterface, resolver: LabelResolver): Result<any>;
      decryptWithKeystore(keystore: CommonKeysInterface): Result<R>;
    }
  : never;
export {};
