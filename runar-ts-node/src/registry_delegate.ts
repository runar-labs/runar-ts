import { TopicPath, ServiceState } from 'runar-ts-common';
import { ServiceMetadata } from 'runar-ts-schemas';
import type { ServiceEntry } from './index';

export interface RegistryDelegate {
  getAllServiceMetadata(localOnly: boolean): Promise<Map<string, ServiceMetadata>>;
  getServiceMetadata(serviceTopic: TopicPath): Promise<ServiceMetadata | undefined>;
  getLocalServiceState(serviceTopic: TopicPath): Promise<ServiceState | undefined>;
  getRemoteServiceState(serviceTopic: TopicPath): Promise<ServiceState | undefined>;
  validatePauseTransition(serviceTopic: TopicPath): Promise<void>;
  validateResumeTransition(serviceTopic: TopicPath): Promise<void>;
  updateLocalServiceStateIfValid(serviceTopic: TopicPath, newState: ServiceState, currentState: ServiceState): Promise<void>;
}

export class NodeRegistryDelegate implements RegistryDelegate {
  private readonly getLocalServicesSnapshot: () => ServiceEntry[];

  constructor(getLocalServicesSnapshot: () => ServiceEntry[]) {
    this.getLocalServicesSnapshot = getLocalServicesSnapshot;
  }

  async getAllServiceMetadata(_localOnly: boolean): Promise<Map<string, ServiceMetadata>> {
    const map = new Map<string, ServiceMetadata>();
    for (const s of this.getLocalServicesSnapshot()) {
      map.set(s.service.path(), this.toServiceMetadata(s));
    }
    return map;
  }

  async getServiceMetadata(serviceTopic: TopicPath): Promise<ServiceMetadata | undefined> {
    const svc = this.getLocalServicesSnapshot().find((e) => e.service.path() === serviceTopic.servicePath());
    return svc ? this.toServiceMetadata(svc) : undefined;
  }

  async getLocalServiceState(serviceTopic: TopicPath): Promise<ServiceState | undefined> {
    const svc = this.getLocalServicesSnapshot().find((e) => e.service.path() === serviceTopic.servicePath());
    return svc?.serviceState;
  }

  async getRemoteServiceState(_serviceTopic: TopicPath): Promise<ServiceState | undefined> {
    // Remote state tracking not implemented yet
    return undefined;
  }

  async validatePauseTransition(serviceTopic: TopicPath): Promise<void> {
    const curr = await this.getLocalServiceState(serviceTopic);
    if (curr !== ServiceState.Running) throw new Error('Service must be Running to pause');
  }

  async validateResumeTransition(serviceTopic: TopicPath): Promise<void> {
    const curr = await this.getLocalServiceState(serviceTopic);
    if (curr !== ServiceState.Paused) throw new Error('Service must be Paused to resume');
  }

  async updateLocalServiceStateIfValid(serviceTopic: TopicPath, newState: ServiceState, currentState: ServiceState): Promise<void> {
    const svc = this.getLocalServicesSnapshot().find((e) => e.service.path() === serviceTopic.servicePath());
    if (!svc) throw new Error('Service not found');
    if (svc.serviceState !== currentState) throw new Error('State changed concurrently');
    svc.serviceState = newState;
  }

  private toServiceMetadata(s: ServiceEntry): ServiceMetadata {
    return {
      network_id: s.serviceTopic.networkId(),
      service_path: s.service.path(),
      name: s.service.name(),
      version: s.service.version(),
      description: s.service.description(),
      actions: [],
      registration_time: s.registrationTime,
      last_start_time: s.lastStartTime ?? null,
    } as unknown as ServiceMetadata;
  }
}


