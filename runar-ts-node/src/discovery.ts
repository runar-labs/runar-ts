import type { Discovery as NativeDiscovery, Keys as NativeKeys } from 'runar-nodejs-api';

/**
 * Discovery interface for peer discovery
 */
export interface NodeDiscovery {
  init(optionsCbor: Uint8Array): Promise<void>;
  bindEventsToTransport(transport: any): Promise<void>;
  startAnnouncing(): Promise<void>;
  stopAnnouncing(): Promise<void>;
  shutdown(): Promise<void>;
  updateLocalPeerInfo(peerInfoCbor: Uint8Array): Promise<void>;
}

/**
 * Concrete implementation that wraps the native Discovery
 */
export class NativeMulticastDiscovery implements NodeDiscovery {
  constructor(private nativeDiscovery: NativeDiscovery) {}

  async init(optionsCbor: Uint8Array): Promise<void> {
    const optionsBuffer = Buffer.from(optionsCbor);
    return this.nativeDiscovery.init(optionsBuffer);
  }

  async bindEventsToTransport(transport: any): Promise<void> {
    return this.nativeDiscovery.bindEventsToTransport(transport);
  }

  async startAnnouncing(): Promise<void> {
    return this.nativeDiscovery.startAnnouncing();
  }

  async stopAnnouncing(): Promise<void> {
    return this.nativeDiscovery.stopAnnouncing();
  }

  async shutdown(): Promise<void> {
    return this.nativeDiscovery.shutdown();
  }

  async updateLocalPeerInfo(peerInfoCbor: Uint8Array): Promise<void> {
    const peerInfoBuffer = Buffer.from(peerInfoCbor);
    return this.nativeDiscovery.updateLocalPeerInfo(peerInfoBuffer);
  }
}

/**
 * Factory function to create discovery instance
 */
export function createDiscovery(keys: NativeKeys, optionsCbor: Uint8Array): NodeDiscovery {
  const optionsBuffer = Buffer.from(optionsCbor);
  const nativeDiscovery = new NativeDiscovery(keys, optionsBuffer);
  return new NativeMulticastDiscovery(nativeDiscovery);
}
