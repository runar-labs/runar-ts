import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Node, KeysService, NodeConfig } from '../src';
import { KeysManagerWrapper } from '../src/keys_manager_wrapper';
import { Keys } from 'runar-nodejs-api';

describe('KeysService', () => {
  it('ensures symmetric key via delegate', async () => {
    const keys = new Keys();
    keys.setPersistenceDir('/tmp/runar-keys-test-service');
    keys.enableAutoPersist(true);
    keys.initAsNode();

    const config = new NodeConfig('net').withKeyManager(keys);
    const node = new Node(config);
    const delegate = new KeysManagerWrapper(keys);
    node.addService(new KeysService(delegate));
    await node.start();
    const result = await node.request('$keys/ensure_symmetric_key', 'label');
    if (!result.ok) {
      assert.fail(`Request failed: ${result.error}`);
    }
    const keyData = result.value.as<Uint8Array>();
    if (!keyData.ok) {
      assert.fail(`Failed to decode key data: ${keyData.error}`);
    }
    // Verify we get a real symmetric key
    assert.ok(keyData.value.length > 0, 'Symmetric key should have length > 0');
    await node.stop();
  });
});
