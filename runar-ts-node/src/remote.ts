import { encode } from 'cbor-x';
import runarApi from 'runar-nodejs-api';

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
  private keys: unknown;
  private transport: unknown;
  private discovery?: unknown;
  private destPeerId?: string;
  private profilePk?: Uint8Array;
  private discoveryOptsCbor?: Uint8Array;

  constructor(keys: unknown, opts?: NapiRemoteAdapterOptions) {
    this.keys = keys;
    const optionsCbor = encode(opts?.transportOptions ?? {});
    this.transport = new runarApi.Transport(keys as any, Buffer.from(optionsCbor));
    if (opts?.discoveryOptions) {
      const discCbor = encode(opts.discoveryOptions);
      this.discovery = new runarApi.Discovery(keys as any, Buffer.from(discCbor));
      this.discoveryOptsCbor = discCbor;
    }
    this.destPeerId = opts?.destPeerId;
    this.profilePk = opts?.profilePublicKey;
  }

  async start(): Promise<void> {
    await (this.transport as any).start();
    if (this.discovery) {
      await (this.discovery as any).init(Buffer.from(this.discoveryOptsCbor ?? encode({})));
      await (this.discovery as any).bindEventsToTransport(this.transport);
      await (this.discovery as any).startAnnouncing();
    }
  }

  async stop(): Promise<void> {
    if (this.discovery) {
      await (this.discovery as any).stopAnnouncing();
      await (this.discovery as any).shutdown();
    }
    await (this.transport as any).stop();
  }

  async request(path: string, payload: Uint8Array): Promise<Uint8Array> {
    if (!this.destPeerId || !this.profilePk) {
      throw new Error('NapiRemoteAdapter requires destPeerId and profilePublicKey');
    }
    const correlationId = crypto.randomUUID();
    const res: Buffer = await (this.transport as any).request(
      path,
      correlationId,
      Buffer.from(payload),
      this.destPeerId,
      Buffer.from(this.profilePk)
    );
    return new Uint8Array(res);
  }

  async publish(path: string, payload: Uint8Array): Promise<void> {
    if (!this.destPeerId) {
      throw new Error('NapiRemoteAdapter requires destPeerId for publish');
    }
    await (this.transport as any).publish(
      path,
      crypto.randomUUID(),
      Buffer.from(payload),
      this.destPeerId
    );
  }
}

export class LoopbackRemoteAdapter implements RemoteAdapter {
  private onRequest: (path: string, payload: Uint8Array) => Promise<Uint8Array> | Uint8Array;
  private onPublish?: (path: string, payload: Uint8Array) => void | Promise<void>;

  constructor(
    onRequest: (path: string, payload: Uint8Array) => Promise<Uint8Array> | Uint8Array,
    onPublish?: (path: string, payload: Uint8Array) => void | Promise<void>
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

export function makeNapiRemoteAdapter(
  keys: unknown,
  opts?: NapiRemoteAdapterOptions
): NapiRemoteAdapter {
  return new NapiRemoteAdapter(keys, opts);
}
