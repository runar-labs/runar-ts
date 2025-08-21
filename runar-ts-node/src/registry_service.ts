import { AbstractService, LifecycleContext, ServiceState } from './core';
import { TopicPath } from 'runar-ts-common';
import { ServiceEntry } from './index';
import { NodeRegistryDelegate, RegistryDelegate } from './registry_delegate';
import { AnyValue } from 'runar-ts-serializer';
import { ServiceMetadata, ActionMetadata } from 'runar-ts-schemas';

export class RegistryService implements AbstractService {
  private _networkId?: string;
  private readonly getLocalServices: () => ServiceEntry[];
  private readonly delegate: RegistryDelegate;

  constructor(getLocalServices: () => ServiceEntry[]) {
    this.getLocalServices = getLocalServices;
    this.delegate = new NodeRegistryDelegate(this.getLocalServices);
  }

  name(): string {
    return 'Registry';
  }
  version(): string {
    return '1.0.0';
  }
  path(): string {
    return '$registry';
  }
  description(): string {
    return 'Local registry service';
  }
  networkId(): string | undefined {
    return this._networkId;
  }
  setNetworkId(networkId: string): void {
    this._networkId = networkId;
  }

  async init(context: LifecycleContext): Promise<void> {
    // services/list -> Vec<ServiceMetadata>
    context.addActionHandler('services/list', async req => {
      const all = await this.delegate.getAllServiceMetadata(true);
      const list = Array.from(all.values());
      return { ok: true, requestId: req.requestId, payload: AnyValue.from(list) };
    });

    // services/{service_path} -> ServiceMetadata
    context.addActionHandler('services/{service_path}', async req => {
      const services = this.getLocalServices();
      // Extract parameters best-effort by scanning segments
      const match = this.findServiceByParam(req.service, req.action, services);
      const meta = match
        ? await this.delegate.getServiceMetadata(
            TopicPath.newService(this._networkId ?? 'default', match.service.path())
          )
        : null;
      return { ok: true, requestId: req.requestId, payload: AnyValue.from(meta) };
    });

    // services/{service_path}/state -> minimal metadata with state
    context.addActionHandler('services/{service_path}/state', async req => {
      const services = this.getLocalServices();
      const match = this.findServiceByParam(req.service, req.action, services);
      const state = match?.serviceState ?? ServiceState.Unknown;
      return {
        ok: true,
        requestId: req.requestId,
        payload: AnyValue.from({ service_path: match?.service.path() ?? '', state }),
      };
    });

    // services/{service_path}/pause -> transition to Paused if valid
    context.addActionHandler('services/{service_path}/pause', async req => {
      const services = this.getLocalServices();
      const match = this.findServiceByParam(req.service, req.action, services);
      if (match) {
        // validate via delegate
        await this.delegate.validatePauseTransition(
          TopicPath.newService(this._networkId ?? 'default', match.service.path())
        );
        match.serviceState = ServiceState.Paused;
        return { ok: true, requestId: req.requestId, payload: AnyValue.from(ServiceState.Paused) };
      }
      return { ok: false, requestId: req.requestId, error: 'Service not found' } as const;
    });

    // services/{service_path}/resume -> transition to Running if valid
    context.addActionHandler('services/{service_path}/resume', async req => {
      const services = this.getLocalServices();
      const match = this.findServiceByParam(req.service, req.action, services);
      if (match) {
        await this.delegate.validateResumeTransition(
          TopicPath.newService(this._networkId ?? 'default', match.service.path())
        );
        match.serviceState = ServiceState.Running;
        return { ok: true, requestId: req.requestId, payload: AnyValue.from(ServiceState.Running) };
      }
      return { ok: false, requestId: req.requestId, error: 'Service not found' } as const;
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

  private findServiceByParam(
    service: string,
    action: string,
    list: ServiceEntry[]
  ): ServiceEntry | undefined {
    // The action string may look like services/{service_path} or services/{service_path}/state
    const parts = action.split('/');
    const svcPath = parts.length >= 2 ? parts[1] : '';
    return list.find(e => e.service.path() === svcPath);
  }
}
