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
    const result = await node.request('$keys/ensure_symmetric_key', 'label');
    assert.ok(result.ok, `Request failed: ${result.error}`);
    const keyData = result.value.as<Uint8Array>();
    assert.ok(keyData.ok, `Failed to decode key data: ${keyData.error}`);
    assert.equal(new TextDecoder().decode(keyData.value), 'pk:label');
    await node.stop();
  });
});
