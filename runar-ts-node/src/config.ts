import type { Keys } from 'runar-nodejs-api';

export class NodeConfig {
  readonly defaultNetworkId: string;
  networkIds: string[] = [];
  requestTimeoutMs = 30000;
  transportOptions?: unknown;
  discoveryOptions?: unknown;
  keys?: Keys;

  private constructor(defaultNetworkId: string) {
    this.defaultNetworkId = defaultNetworkId;
  }

  static new(defaultNetworkId: string): NodeConfig {
    return new NodeConfig(defaultNetworkId);
  }

  withNetworkIds(networkIds: string[]): this {
    this.networkIds = [...networkIds];
    return this;
  }

  addNetworkId(networkId: string): this {
    this.networkIds.push(networkId);
    return this;
  }

  withRequestTimeoutMs(ms: number): this {
    this.requestTimeoutMs = ms;
    return this;
  }

  withTransportOptions(options: unknown): this {
    this.transportOptions = options;
    return this;
  }

  withDiscoveryOptions(options: unknown): this {
    this.discoveryOptions = options;
    return this;
  }

  withKeys(keys: Keys): this {
    this.keys = keys;
    return this;
  }
}


