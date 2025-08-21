import { AbstractService, LifecycleContext } from 'runar-ts-common';
import { AnyValue } from 'runar-ts-serializer';
import type { KeysDelegate } from './keys_delegate';

export class KeysService implements AbstractService {
  private _networkId?: string;
  constructor(private readonly delegate: KeysDelegate) {}

  name(): string {
    return 'runar keys';
  }
  version(): string {
    return '1.0.0';
  }
  path(): string {
    return '$keys';
  }
  description(): string {
    return 'Keys service for key management';
  }
  networkId(): string | undefined {
    return this._networkId;
  }
  setNetworkId(networkId: string): void {
    this._networkId = networkId;
  }

  async init(context: LifecycleContext): Promise<void> {
    context.addActionHandler('ensure_symmetric_key', async req => {
      const av = AnyValue.fromBytes(req.payload);
      const r = av.as<any>();
      let label = '';
      if (r.ok) {
        const v = r.value;
        if (typeof v === 'string') {
          label = v;
        } else if (v instanceof Uint8Array) {
          label = new TextDecoder().decode(v);
        }
      }
      const outBytes = await this.delegate.ensureSymmetricKey(label);
      const out = AnyValue.from(outBytes).serialize();
      return { ok: true, requestId: req.requestId, payload: out.ok ? out.value : new Uint8Array() };
    });
  }

  async start(_context: LifecycleContext): Promise<void> {}
  async stop(_context: LifecycleContext): Promise<void> {}
}
