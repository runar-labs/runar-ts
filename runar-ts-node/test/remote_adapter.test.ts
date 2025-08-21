import { describe, it, expect } from 'bun:test';
import { Node } from '../src';
import { AnyValue } from 'runar-ts-serializer';
import { LoopbackRemoteAdapter } from '../src/remote';

describe('RemoteAdapter integration', () => {
  it('falls back to remote adapter when no local handler exists', async () => {
    const node = new Node('net');
    node.setRemoteAdapter(
      new LoopbackRemoteAdapter(async (path, payload) => {
        // decode
        const av = AnyValue.fromBytes<{ x: number }>(payload);
        const r = av.as<{ x: number }>();
        expect(r.ok).toBe(true);
        // respond
        const out = AnyValue.from({ y: (r.ok ? r.value.x : 0) + 1 }).serialize();
        expect(out.ok).toBe(true);
        return out.ok ? out.value : new Uint8Array();
      })
    );
    await node.start();
    const res = await node.request<{ x: number }, { y: number }>('remote', 'inc', { x: 10 });
    expect(res.y).toBe(11);
    await node.stop();
  });
});
