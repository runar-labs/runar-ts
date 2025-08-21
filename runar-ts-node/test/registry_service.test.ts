import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Node } from '../src';
import { AbstractService, LifecycleContext } from 'runar-ts-common';
import { AnyValue } from 'runar-ts-serializer';

class DummyService implements AbstractService {
  private _network?: string;
  name(): string { return 'Dummy'; }
  version(): string { return '1.0.0'; }
  path(): string { return 'dummy'; }
  description(): string { return 'Dummy'; }
  networkId(): string | undefined { return this._network; }
  setNetworkId(n: string): void { this._network = n; }
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
    assert.equal(Array.isArray(res), true);
    assert.ok(res.find((s: any) => s.service_path === 'dummy'));
  });

  it('gets service info', async () => {
    const node = new Node('net');
    node.addService(new DummyService());
    await node.start();
    const res = await node.request<undefined, any>('$registry', 'services/dummy', undefined as any);
    assert.equal(res.service_path, 'dummy');
    assert.equal(res.name, 'Dummy');
  });

  it('gets service state', async () => {
    const node = new Node('net');
    node.addService(new DummyService());
    await node.start();
    const res = await node.request<undefined, any>('$registry', 'services/dummy/state', undefined as any);
    assert.equal(res.service_path, 'dummy');
    assert.notEqual(res.state, undefined);
  });

  it('pauses and resumes a service via registry actions', async () => {
    const node = new Node('net');
    node.addService(new DummyService());
    await node.start();
    const paused = await node.request<undefined, any>('$registry', 'services/dummy/pause', undefined as any);
    assert.equal(paused, 'Paused');
    const state1 = await node.request<undefined, any>('$registry', 'services/dummy/state', undefined as any);
    assert.equal(state1.state, 'Paused');
    const resumed = await node.request<undefined, any>('$registry', 'services/dummy/resume', undefined as any);
    assert.equal(resumed, 'Running');
    const state2 = await node.request<undefined, any>('$registry', 'services/dummy/state', undefined as any);
    assert.equal(state2.state, 'Running');
  });
});


