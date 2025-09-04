import { Result } from 'runar-ts-common/src/error/Result.js';
import { CommonKeysInterface } from '../keystore/device_caps.js';

export class SerializationContext {
  constructor(
    public keystore: CommonKeysInterface,
    public resolver: import('../label_resolver.js').LabelResolver,
    public networkPublicKey: Uint8Array,
    public profilePublicKeys: Uint8Array[]
  ) {}
}

export class DeserializationContext {
  constructor(
    public keystore?: CommonKeysInterface,
    public resolver?: import('../label_resolver.js').LabelResolver,
    public decryptEnvelope?: (eed: Uint8Array) => Result<Uint8Array>
  ) {}
}

/**
 * Lazy data holder for complex types that are not immediately deserialized
 */
export class LazyDataWithOffset {
  constructor(
    public typeName: string,
    public originalBuffer: Uint8Array,
    public encrypted: boolean,
    public startOffset?: number,
    public endOffset?: number,
    public keystore?: CommonKeysInterface
  ) {}
}
