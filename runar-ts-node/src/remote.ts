import { encode } from 'cbor-x';
import type runar from 'runar-nodejs-api';

export interface RemoteAdapter {
  start?(): Promise<void>;
  stop?(): Promise<void>;
  request(path: string, payload: Uint8Array): Promise<Uint8Array>;
  publish(path: string, payload: Uint8Array): Promise<void>;
}

export interface NapiRemoteAdapterOptions {
  transportOptions?: unknown;
  discoveryOptions?: unknown;
  destPeerId?: string;
  profilePublicKey?: Uint8Array;
}

export class NapiRemoteAdapter implements RemoteAdapter {
  private keys: any;
  private transport: any;
  private discovery?: any;
  private destPeerId?: string;
  private profilePk?: Uint8Array;

  constructor(keys: any, opts?: NapiRemoteAdapterOptions) {
    const api = (require('runar-nodejs-api') as typeof runar) as any;
    this.keys = keys;
    const optionsCbor = encode(opts?.transportOptions ?? {});
    this.transport = new api.Transport(keys, Buffer.from(optionsCbor));
    if (opts?.discoveryOptions) {
      const discCbor = encode(opts.discoveryOptions);
      this.discovery = new api.Discovery(keys, Buffer.from(discCbor));
    }
    this.destPeerId = opts?.destPeerId;
    this.profilePk = opts?.profilePublicKey;
  }

  async start(): Promise<void> {
    await this.transport.start();
    if (this.discovery) {
      await this.discovery.init(encode({}));
      await this.discovery.bindEventsToTransport(this.transport);
      await this.discovery.startAnnouncing();
    }
  }

  async stop(): Promise<void> {
    if (this.discovery) {
      await this.discovery.stopAnnouncing();
      await this.discovery.shutdown();
    }
    await this.transport.stop();
  }

  async request(path: string, payload: Uint8Array): Promise<Uint8Array> {
    if (!this.destPeerId || !this.profilePk) {
      throw new Error('NapiRemoteAdapter requires destPeerId and profilePublicKey');
    }
    const correlationId = crypto.randomUUID();
    const res: Buffer = await this.transport.request(
      path,
      correlationId,
      Buffer.from(payload),
      this.destPeerId,
      Buffer.from(this.profilePk),
    );
    return new Uint8Array(res);
  }

  async publish(path: string, payload: Uint8Array): Promise<void> {
    if (!this.destPeerId) {
      throw new Error('NapiRemoteAdapter requires destPeerId for publish');
    }
    await this.transport.publish(path, crypto.randomUUID(), Buffer.from(payload), this.destPeerId);
  }
}

export class LoopbackRemoteAdapter implements RemoteAdapter {
  private onRequest: (path: string, payload: Uint8Array) => Promise<Uint8Array> | Uint8Array;
  private onPublish?: (path: string, payload: Uint8Array) => void | Promise<void>;

  constructor(
    onRequest: (path: string, payload: Uint8Array) => Promise<Uint8Array> | Uint8Array,
    onPublish?: (path: string, payload: Uint8Array) => void | Promise<void>,
  ) {
    this.onRequest = onRequest;
    this.onPublish = onPublish;
  }

  async request(path: string, payload: Uint8Array): Promise<Uint8Array> {
    const r = await this.onRequest(path, payload);
    return r;
  }

  async publish(path: string, payload: Uint8Array): Promise<void> {
    await this.onPublish?.(path, payload);
  }
}


