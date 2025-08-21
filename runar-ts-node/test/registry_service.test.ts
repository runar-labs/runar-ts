import { describe, it, expect } from 'bun:test';
import { Node } from '../src';
import { RegistryService } from '../src/registry_service';
import { TopicPath } from 'runar-ts-common';
import { ServiceState } from 'runar-ts-schemas';
import { AbstractService, LifecycleContext } from '../src/core';

class DummyService implements AbstractService {
  private _network?: string;
  name(): string {
    return 'Dummy';
  }
  version(): string {
    return '1.0.0';
  }
  path(): string {
    return 'dummy';
  }
  description(): string {
    return 'Dummy';
  }
  networkId(): string | undefined {
    return this._network;
  }
  setNetworkId(n: string): void {
    this._network = n;
  }
  async init(_c: LifecycleContext): Promise<void> {}
  async start(_c: LifecycleContext): Promise<void> {}
  async stop(_c: LifecycleContext): Promise<void> {}
}

describe('RegistryService', () => {
  it('lists services', async () => {
    const node = new Node('net');
    node.addService(new DummyService());
    await node.start();
    const res = await node.request<undefined, any>('$registry', 'services/list', undefined as any);
    expect(Array.isArray(res)).toBe(true);
    expect(res.find((s: any) => s.service_path === 'dummy')).toBeDefined();
  });

  it('gets service info', async () => {
    const node = new Node('net');
    node.addService(new DummyService());
    await node.start();
    const res = await node.request<undefined, any>('$registry', 'services/dummy', undefined as any);
    expect(res.service_path).toBe('dummy');
    expect(res.name).toBe('Dummy');
  });

  it('gets service state', async () => {
    const node = new Node('net');
    node.addService(new DummyService());
    await node.start();
    const res = await node.request<undefined, any>(
      '$registry',
      'services/dummy/state',
      undefined as any
    );
    expect(res.service_path).toBe('dummy');
    expect(res.state).toBeDefined();
  });

  it('pauses and resumes a service via registry actions', async () => {
    const node = new Node('net');
    node.addService(new DummyService());
    await node.start();
    const paused = await node.request<undefined, any>(
      '$registry',
      'services/dummy/pause',
      undefined as any
    );
    expect(paused).toBe('Paused');
    const state1 = await node.request<undefined, any>(
      '$registry',
      'services/dummy/state',
      undefined as any
    );
    expect(state1.state).toBe('Paused');
    const resumed = await node.request<undefined, any>(
      '$registry',
      'services/dummy/resume',
      undefined as any
    );
    expect(resumed).toBe('Running');
    const state2 = await node.request<undefined, any>(
      '$registry',
      'services/dummy/state',
      undefined as any
    );
    expect(state2.state).toBe('Running');
  });
});
