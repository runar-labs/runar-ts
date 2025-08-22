import { describe, it, expect } from 'bun:test';
import { Node } from '../src';
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
    console.log('Node started, about to make request');
    console.log('About to call node.request');
    console.log('Node methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(node)).filter(name => name.includes('request')));
    const res = await node.request<undefined, any>('$registry/services/list', undefined as any);
    console.log('Request returned:', res);
    expect(res.ok).toBe(true);
    const services = res.value.as<any[]>();
    expect(services.ok).toBe(true);
    expect(Array.isArray(services.value)).toBe(true);
    expect(services.value.find((s: any) => s.service_path === 'dummy')).toBeDefined();
  });

  it('gets service info', async () => {
    const node = new Node('net');
    node.addService(new DummyService());
    await node.start();
    const res = await node.request<undefined, any>('$registry/services/dummy', undefined as any);
    expect(res.ok).toBe(true);
    const serviceInfo = res.value.as<any>();
    expect(serviceInfo.ok).toBe(true);
    expect(serviceInfo.value.service_path).toBe('dummy');
    expect(serviceInfo.value.name).toBe('Dummy');
  });

  it('gets service state', async () => {
    const node = new Node('net');
    node.addService(new DummyService());
    await node.start();
    const res = await node.request<undefined, any>(
      '$registry/services/dummy/state',
      undefined as any
    );
    expect(res.ok).toBe(true);
    const stateInfo = res.value.as<any>();
    expect(stateInfo.ok).toBe(true);
    expect(stateInfo.value.service_path).toBe('dummy');
    expect(stateInfo.value.state).toBeDefined();
  });

  it('pauses and resumes a service via registry actions', async () => {
    const node = new Node('net');
    node.addService(new DummyService());
    await node.start();
    const paused = await node.request<undefined, any>(
      '$registry/services/dummy/pause',
      undefined as any
    );
    expect(paused.ok).toBe(true);
    const pausedValue = paused.value.as<any>();
    expect(pausedValue.ok).toBe(true);
    expect(pausedValue.value).toBe('Paused');

    const state1 = await node.request<undefined, any>(
      '$registry/services/dummy/state',
      undefined as any
    );
    expect(state1.ok).toBe(true);
    const state1Value = state1.value.as<any>();
    expect(state1Value.ok).toBe(true);
    expect(state1Value.value.state).toBe('Paused');

    const resumed = await node.request<undefined, any>(
      '$registry/services/dummy/resume',
      undefined as any
    );
    expect(resumed.ok).toBe(true);
    const resumedValue = resumed.value.as<any>();
    expect(resumedValue.ok).toBe(true);
    expect(resumedValue.value).toBe('Running');

    const state2 = await node.request<undefined, any>(
      '$registry/services/dummy/state',
      undefined as any
    );
    expect(state2.ok).toBe(true);
    const state2Value = state2.value.as<any>();
    expect(state2Value.ok).toBe(true);
    expect(state2Value.value.state).toBe('Running');
  });
});
