import type { Transport as NativeTransport } from 'runar-nodejs-api';

/**
 * Transport interface for QUIC networking
 */
export interface QuicTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  request(
    path: string,
    correlationId: string,
    payload: Uint8Array,
    destPeerId: string,
    networkPublicKey?: Uint8Array,
    profilePublicKeys?: Uint8Array[]
  ): Promise<Uint8Array>;
  publish(
    path: string,
    correlationId: string,
    payload: Uint8Array,
    destPeerId: string,
    networkPublicKey?: Uint8Array
  ): Promise<void>;
  connectPeer(peerInfoCbor: Uint8Array): Promise<void>;
  isConnected(peerId: string): Promise<boolean>;
  isConnectedToPublicKey(peerPublicKey: Uint8Array): Promise<boolean>;
  updatePeers(nodeInfoCbor: Uint8Array): Promise<void>;
}

/**
 * Concrete implementation that wraps the native Transport
 */
export class NativeQuicTransport implements QuicTransport {
  constructor(private nativeTransport: NativeTransport) {}

  async start(): Promise<void> {
    return this.nativeTransport.start();
  }

  async stop(): Promise<void> {
    return this.nativeTransport.stop();
  }

  async request(
    path: string,
    correlationId: string,
    payload: Uint8Array,
    destPeerId: string,
    networkPublicKey?: Uint8Array,
    profilePublicKeys?: Uint8Array[]
  ): Promise<Uint8Array> {
    // Convert Uint8Array to Buffer for native API compatibility
    const payloadBuffer = Buffer.from(payload);
    const networkPkBuffer = networkPublicKey ? Buffer.from(networkPublicKey) : null;
    const profileKeysBuffers = profilePublicKeys ? profilePublicKeys.map(pk => Buffer.from(pk)) : [];

    const responseBuffer = await this.nativeTransport.request(
      path,
      correlationId,
      payloadBuffer,
      destPeerId,
      networkPkBuffer,
      profileKeysBuffers
    );

    return new Uint8Array(responseBuffer);
  }

  async publish(
    path: string,
    correlationId: string,
    payload: Uint8Array,
    destPeerId: string,
    networkPublicKey?: Uint8Array
  ): Promise<void> {
    const payloadBuffer = Buffer.from(payload);
    const networkPkBuffer = networkPublicKey ? Buffer.from(networkPublicKey) : null;

    return this.nativeTransport.publish(
      path,
      correlationId,
      payloadBuffer,
      destPeerId,
      networkPkBuffer
    );
  }

  async connectPeer(peerInfoCbor: Uint8Array): Promise<void> {
    const peerInfoBuffer = Buffer.from(peerInfoCbor);
    return this.nativeTransport.connectPeer(peerInfoBuffer);
  }

  async isConnected(peerId: string): Promise<boolean> {
    return this.nativeTransport.isConnected(peerId);
  }

  async isConnectedToPublicKey(peerPublicKey: Uint8Array): Promise<boolean> {
    const peerPkBuffer = Buffer.from(peerPublicKey);
    return this.nativeTransport.isConnectedToPublicKey(peerPkBuffer);
  }

  async updatePeers(nodeInfoCbor: Uint8Array): Promise<void> {
    const nodeInfoBuffer = Buffer.from(nodeInfoCbor);
    return this.nativeTransport.updatePeers(nodeInfoBuffer);
  }
}
