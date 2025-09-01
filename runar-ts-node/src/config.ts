import type { Keys } from 'runar-nodejs-api';
import type { LabelResolverConfig } from 'runar-ts-serializer';

export interface NetworkConfig {
  bindAddr?: string; // ip:port
  discovery?: {
    useMulticast: boolean;
    localAddresses?: string[];
    timeouts?: { announce?: number; discovery?: number; debounce?: number };
  };
}

export class NodeConfig {
  public defaultNetworkId: string;
  public networkIds: string[];
  public requestTimeoutMs: number;
  public labelResolverConfig: LabelResolverConfig; // Required for encryption
  public networkConfig?: NetworkConfig;
  public role?: 'frontend' | 'backend'; // TypeScript only - Rust doesn't need this
  private keyManager?: Keys; // Already initialized Keys instance from FFI

  constructor(defaultNetworkId: string, labelResolverConfig: LabelResolverConfig) {
    this.defaultNetworkId = defaultNetworkId;
    this.networkIds = [];
    this.requestTimeoutMs = 30000;
    this.labelResolverConfig = labelResolverConfig;
    this.role = 'backend'; // Default to backend for TypeScript
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

  withNetworkConfig(networkConfig: NetworkConfig): this {
    this.networkConfig = networkConfig;
    return this;
  }

  withRole(role: 'frontend' | 'backend'): this {
    this.role = role;
    return this;
  }

  // Getter for key manager (used by Node constructor)
  getKeyManager(): Keys | undefined {
    return this.keyManager;
  }

  // Getter for label resolver config
  getLabelResolverConfig(): LabelResolverConfig {
    return this.labelResolverConfig;
  }
}
