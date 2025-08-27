import type { Keys } from 'runar-nodejs-api';

export class NodeConfig {
  public defaultNetworkId: string;
  public networkIds: string[];
  public requestTimeoutMs: number;
  private keyManager?: Keys; // Already initialized Keys instance from FFI

  constructor(defaultNetworkId: string) {
    this.defaultNetworkId = defaultNetworkId;
    this.networkIds = [];
    this.requestTimeoutMs = 30000;
  }

  // Match Rust with_key_manager() method
  withKeyManager(keyManager: Keys): this {
    this.keyManager = keyManager;
    return this;
  }

  withAdditionalNetworks(networkIds: string[]): this {
    this.networkIds = [...networkIds];
    return this;
  }

  withRequestTimeout(timeoutMs: number): this {
    this.requestTimeoutMs = timeoutMs;
    return this;
  }

  // Getter for key manager (used by Node constructor)
  getKeyManager(): Keys | undefined {
    return this.keyManager;
  }
}
