import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Node, KeysService, NodeConfig } from '../src';
import type { KeysManagerWrapper } from '../src/keys_manager_wrapper';

class MockKeysManagerWrapper implements KeysManagerWrapper {
  ensureSymmetricKey(keyName: string): Buffer {
    return Buffer.from(`pk:${keyName}`);
  }

  encryptWithEnvelope(data: Buffer, networkId: string | null, profilePublicKeys: Buffer[]): Buffer {
    return data; // Mock implementation
  }

  decryptEnvelope(eedCbor: Buffer): Buffer {
    return eedCbor; // Mock implementation
  }

  setLabelMapping(mappingCbor: Buffer): void {}
  setLocalNodeInfo(nodeInfoCbor: Buffer): void {}
  setPersistenceDir(dir: string): void {}
  enableAutoPersist(enabled: boolean): void {}
  async wipePersistence(): Promise<void> {}
  async flushState(): Promise<void> {}
  getKeystoreState(): number {
    return 1;
  }
  getKeystoreCaps(): any {
    return {};
  }
}

describe('KeysService', () => {
  it('ensures symmetric key via delegate', async () => {
    const mockKeys = new MockKeysManagerWrapper();
    const config = new NodeConfig('net').withKeyManager(mockKeys as any);
    const node = new Node(config);
    const delegate = new MockKeysManagerWrapper();
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
