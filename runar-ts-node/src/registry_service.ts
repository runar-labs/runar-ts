import { AbstractService, LifecycleContext } from 'runar-ts-common';
import { ServiceEntry } from './index';
import { AnyValue } from 'runar-ts-serializer';
import { ServiceMetadata, ActionMetadata, NodeMetadata } from 'runar-ts-schemas';

export class RegistryService implements AbstractService {
  private _networkId?: string;
  private readonly getLocalServices: () => ServiceEntry[];

  constructor(getLocalServices: () => ServiceEntry[]) {
    this.getLocalServices = getLocalServices;
  }

  name(): string { return 'Registry'; }
  version(): string { return '1.0.0'; }
  path(): string { return '$registry'; }
  description(): string { return 'Local registry service'; }
  networkId(): string | undefined { return this._networkId; }
  setNetworkId(networkId: string): void { this._networkId = networkId; }

  async init(context: LifecycleContext): Promise<void> {
    // services/list -> Vec<ServiceMetadata>
    context.addActionHandler('services/list', async (req) => {
      const list = this.getLocalServices().map((s) => this.toServiceMetadata(s));
      const out = AnyValue.from(list).serialize();
      return { ok: true, requestId: req.requestId, payload: out.ok ? out.value : new Uint8Array() };
    });

    // services/{service_path} -> ServiceMetadata
    context.addActionHandler('services/{service_path}', async (req) => {
      const services = this.getLocalServices();
      // Extract parameters best-effort by scanning segments
      const match = this.findServiceByParam(req.service, req.action, services);
      const out = AnyValue.from(match ? this.toServiceMetadata(match) : null).serialize();
      return { ok: true, requestId: req.requestId, payload: out.ok ? out.value : new Uint8Array() };
    });

    // services/{service_path}/state -> minimal metadata with state
    context.addActionHandler('services/{service_path}/state', async (req) => {
      const services = this.getLocalServices();
      const match = this.findServiceByParam(req.service, req.action, services);
      const state = match?.serviceState ?? 'Unknown';
      const out = AnyValue.from({ service_path: match?.service.path() ?? '', state }).serialize();
      return { ok: true, requestId: req.requestId, payload: out.ok ? out.value : new Uint8Array() };
    });
  }

  async start(_context: LifecycleContext): Promise<void> {}
  async stop(_context: LifecycleContext): Promise<void> {}

  private toServiceMetadata(s: ServiceEntry): ServiceMetadata {
    const actions: ActionMetadata[] = []; // not tracking per-action metadata yet
    return {
      network_id: this._networkId ?? 'default',
      service_path: s.service.path(),
      name: s.service.name(),
      version: s.service.version(),
      description: s.service.description(),
      actions,
      registration_time: s.registrationTime,
      last_start_time: s.lastStartTime ?? null,
    };
  }

  private findServiceByParam(service: string, action: string, list: ServiceEntry[]): ServiceEntry | undefined {
    // The action string may look like services/{service_path} or services/{service_path}/state
    const parts = action.split('/');
    const idx = parts.findIndex((p) => p !== 'services');
    const svcPath = parts.length >= 2 ? parts[1] : '';
    return list.find((e) => e.service.path() === svcPath);
  }
}


