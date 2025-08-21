export interface KeysDelegate {
  ensureSymmetricKey(keyName: string): Promise<Uint8Array>;
}

// Type definition for NAPI keys interface
interface NapiKeys {
  ensureSymmetricKey(keyName: string): Buffer;
}

export class NapiKeysDelegate implements KeysDelegate {
  private readonly keys: NapiKeys;
  constructor(keys: NapiKeys) {
    this.keys = keys;
  }

  async ensureSymmetricKey(keyName: string): Promise<Uint8Array> {
    const out: Buffer = this.keys.ensureSymmetricKey(keyName);
    return new Uint8Array(out);
  }
}
