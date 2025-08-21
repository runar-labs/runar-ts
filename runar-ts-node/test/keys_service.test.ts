import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Node, NapiKeysDelegate, KeysService } from '../src';

class MockKeysDelegate extends NapiKeysDelegate {
  constructor() { super({ mobileDeriveUserProfileKey: (l: string) => Buffer.from(`pk:${l}`) }); }
}

describe('KeysService', () => {
  it('ensures symmetric key via delegate', async () => {
    const node = new Node('net');
    const delegate = new MockKeysDelegate();
    node.addService(new KeysService(delegate));
    await node.start();
    const out = await node.request<Uint8Array, Uint8Array>('$keys', 'ensure_symmetric_key', new TextEncoder().encode('label'));
    assert.equal(new TextDecoder().decode(out), 'pk:label');
    await node.stop();
  });
});


