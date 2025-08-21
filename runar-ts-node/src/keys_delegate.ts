export interface KeysDelegate {
  ensureSymmetricKey(keyName: string): Promise<Uint8Array>;
}

export class NapiKeysDelegate implements KeysDelegate {
  private readonly keys: any;
  constructor(keys: any) { this.keys = keys; }

  async ensureSymmetricKey(keyName: string): Promise<Uint8Array> {
    // Derive a user profile key deterministically by label
    const out: Buffer = this.keys.mobileDeriveUserProfileKey(keyName);
    return new Uint8Array(out);
  }
}


