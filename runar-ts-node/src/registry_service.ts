import { AbstractService, NodeLifecycleContext, ServiceState } from './core';
import { Result, ok, err } from 'runar-ts-common';
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

  async init(context: NodeLifecycleContext): Promise<Result<void, string>> {
    context.logger.info('Initializing RegistryService');

    // services/list -> Vec<ServiceMetadata>
    const result1 = await context.registerAction('services/list', async (payload, context) => {
      context.logger.debug('Handling services/list request');
      const all = await this.delegate.getAllServiceMetadata(true);
      const list = Array.from(all.values());
      context.logger.debug(`Returning ${list.length} services`);
      return ok(AnyValue.from(list));
    });

    if (!result1.ok) {
      context.logger.error(`Failed to register services/list: ${result1.error}`);
      return err(`Failed to register services/list: ${result1.error}`);
    }

    // services/{service_path} -> ServiceMetadata
    const result2 = await context.registerAction(
      'services/{service_path}',
      async (payload, context) => {
        const services = this.getLocalServices();
        // Extract service_path parameter from pathParams (framework extracts this)
        const servicePath = context.pathParams.get('service_path');
        context.logger.debug(
          `services/{service_path} called with pathParams: ${Array.from(
            context.pathParams.entries()
          )
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}, extracted servicePath: ${servicePath}`
        );
        const match = this.findServiceByPath(servicePath || null, services);
        let meta = null;
        if (match) {
          const serviceTopicResult = TopicPath.newService(this._networkId ?? 'default', match.service.path());
          const serviceTopic = serviceTopicResult.ok ? serviceTopicResult.value : undefined;
          if (serviceTopic) {
            meta = await this.delegate.getServiceMetadata(serviceTopic);
          }
        }
        return ok(AnyValue.from(meta));
      }
    );

    // services/{service_path}/state -> minimal metadata with state
    const result3 = await context.registerAction(
      'services/{service_path}/state',
      async (payload, context) => {
        const services = this.getLocalServices();
        const servicePath = context.pathParams.get('service_path');
        const match = this.findServiceByPath(servicePath || null, services);
        const state = match?.serviceState ?? ServiceState.Unknown;
        return ok(AnyValue.from({ service_path: match?.service.path() ?? '', state }));
      }
    );

    // services/{service_path}/pause -> transition to Paused if valid
    const result4 = await context.registerAction(
      'services/{service_path}/pause',
      async (payload, context) => {
        const services = this.getLocalServices();
        const servicePath = context.pathParams.get('service_path');
        const match = this.findServiceByPath(servicePath || null, services);
        if (match) {
          // validate via delegate
          const serviceTopicResult = TopicPath.newService(this._networkId ?? 'default', match.service.path());
          if (serviceTopicResult.ok) {
            await this.delegate.validatePauseTransition(serviceTopicResult.value);
          }
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
        const servicePath = context.pathParams.get('service_path');
        const match = this.findServiceByPath(servicePath || null, services);
        if (match) {
          const serviceTopicResult = TopicPath.newService(this._networkId ?? 'default', match.service.path());
          if (serviceTopicResult.ok) {
            await this.delegate.validateResumeTransition(serviceTopicResult.value);
          }
          match.serviceState = ServiceState.Running;
          return ok(AnyValue.from(ServiceState.Running));
        }
        return err('Service not found');
      }
    );

    // Return early on any registration failure
    if (!result2.ok) {
      context.logger.error(`Failed to register services/{service_path}: ${result2.error}`);
      return err(`Failed to register services/{service_path}: ${result2.error}`);
    }
    if (!result3.ok) {
      context.logger.error(`Failed to register services/{service_path}/state: ${result3.error}`);
      return err(`Failed to register services/{service_path}/state: ${result3.error}`);
    }
    if (!result4.ok) {
      context.logger.error(`Failed to register services/{service_path}/pause: ${result4.error}`);
      return err(`Failed to register services/{service_path}/pause: ${result4.error}`);
    }
    if (!result5.ok) {
      context.logger.error(`Failed to register services/{service_path}/resume: ${result5.error}`);
      return err(`Failed to register services/{service_path}/resume: ${result5.error}`);
    }

    context.logger.info('RegistryService initialization complete');
    return ok(undefined);
  }

  async start(_context: NodeLifecycleContext): Promise<Result<void, string>> {
    return ok(undefined);
  }
  async stop(_context: NodeLifecycleContext): Promise<Result<void, string>> {
    return ok(undefined);
  }

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

  private findServiceByPath(
    servicePath: string | null,
    list: ServiceEntry[]
  ): ServiceEntry | undefined {
    if (!servicePath) return undefined;
    // Extract service path from full path like "services/my-service" -> "my-service"
    const parts = servicePath.split('/');
    const svcPath = parts.length >= 2 ? parts[1] : servicePath;
    return list.find(e => e.service.path() === svcPath);
  }
}
