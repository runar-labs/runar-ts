import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Node, KeysService } from '../src';
import type { KeysDelegate } from '../src/keys_delegate';

class MockKeysDelegate implements KeysDelegate {
  async ensureSymmetricKey(keyName: string): Promise<Uint8Array> {
    return new TextEncoder().encode(`pk:${keyName}`);
  }
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


