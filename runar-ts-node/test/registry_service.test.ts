import { describe, it, expect } from 'bun:test';
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
    expect(Array.isArray(res)).toBe(true);
    expect(res.find((s: any) => s.service_path === 'dummy')).toBeTruthy();
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
    const res = await node.request<undefined, any>('$registry', 'services/dummy/state', undefined as any);
    expect(res.service_path).toBe('dummy');
    expect(res.state).toBeDefined();
  });
});


