import { AbstractService, LifecycleContext, ServiceState } from './core';
import { ok, err } from 'runar-ts-common';
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
    const result1 = await context.registerAction('services/list', async (payload, context) => {
      const all = await this.delegate.getAllServiceMetadata(true);
      const list = Array.from(all.values());
      return ok(AnyValue.from(list));
    });

    // services/{service_path} -> ServiceMetadata
    const result2 = await context.registerAction(
      'services/{service_path}',
      async (payload, context) => {
        const services = this.getLocalServices();
        // Extract service_path parameter from context or payload
        // In the new API, parameters are extracted from the request context
        const servicePath = context.servicePath;
        const match = this.findServiceByPath(servicePath, services);
        const meta = match
          ? await this.delegate.getServiceMetadata(
              TopicPath.newService(this._networkId ?? 'default', match.service.path())
            )
          : null;
        return ok(AnyValue.from(meta));
      }
    );

    // services/{service_path}/state -> minimal metadata with state
    const result3 = await context.registerAction(
      'services/{service_path}/state',
      async (payload, context) => {
        const services = this.getLocalServices();
        const servicePath = context.servicePath;
        const match = this.findServiceByPath(servicePath, services);
        const state = match?.serviceState ?? ServiceState.Unknown;
        return ok(AnyValue.from({ service_path: match?.service.path() ?? '', state }));
      }
    );

    // services/{service_path}/pause -> transition to Paused if valid
    const result4 = await context.registerAction(
      'services/{service_path}/pause',
      async (payload, context) => {
        const services = this.getLocalServices();
        const servicePath = context.servicePath;
        const match = this.findServiceByPath(servicePath, services);
        if (match) {
          // validate via delegate
          await this.delegate.validatePauseTransition(
            TopicPath.newService(this._networkId ?? 'default', match.service.path())
          );
          match.serviceState = ServiceState.Paused;
          return ok(AnyValue.from(ServiceState.Paused));
        }
        return err('Service not found');
      }
    );

    // services/{service_path}/resume -> transition to Running if valid
    const result5 = await context.registerAction(
      'services/{service_path}/resume',
      async (payload, context) => {
        const services = this.getLocalServices();
        const servicePath = context.servicePath;
        const match = this.findServiceByPath(servicePath, services);
        if (match) {
          await this.delegate.validateResumeTransition(
            TopicPath.newService(this._networkId ?? 'default', match.service.path())
          );
          match.serviceState = ServiceState.Running;
          return ok(AnyValue.from(ServiceState.Running));
        }
        return err('Service not found');
      }
    );

    // Check all registration results
    if (!result1.ok) throw new Error(`Failed to register services/list: ${result1.error}`);
    if (!result2.ok)
      throw new Error(`Failed to register services/{service_path}: ${result2.error}`);
    if (!result3.ok)
      throw new Error(`Failed to register services/{service_path}/state: ${result3.error}`);
    if (!result4.ok)
      throw new Error(`Failed to register services/{service_path}/pause: ${result4.error}`);
    if (!result5.ok)
      throw new Error(`Failed to register services/{service_path}/resume: ${result5.error}`);
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

  private findServiceByPath(servicePath: string, list: ServiceEntry[]): ServiceEntry | undefined {
    // Extract service path from full path like "services/my-service" -> "my-service"
    const parts = servicePath.split('/');
    const svcPath = parts.length >= 2 ? parts[1] : servicePath;
    return list.find(e => e.service.path() === svcPath);
  }
}
