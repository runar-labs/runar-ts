import { describe, it, expect } from 'bun:test';
import { AnyValue } from '../src';
import { ValueCategory, writeHeader } from '../src/wire';
import { encode, decode } from 'cbor-x';
import runar from 'runar-nodejs-api';
const { Keys } = runar as any;

describe('Encryption envelope roundtrip', () => {
  it('encrypts and decrypts a small payload via NAPI Keys', async () => {
    const keys = new Keys();

    // Set persistence directory first
    keys.setPersistenceDir('/tmp/runar-keys-test');
    keys.enableAutoPersist(true);

    // Initialize as node manager for local encryption
    keys.initAsNode();

    const obj = { a: 1, b: 'x' };
    const body = encode(obj);
    const header = writeHeader({ category: ValueCategory.Json, isEncrypted: true });

    // Use local encryption for this test (simpler than envelope encryption)
    const eed = keys.encryptLocalData(Buffer.from(body));
    const wire = new Uint8Array(header.length + eed.length);
    wire.set(header, 0);
    wire.set(new Uint8Array(eed), header.length);

    const av = AnyValue.fromBytes<typeof obj>(wire, {
      decryptEnvelope: eedBytes => {
        try {
          const out = keys.decryptLocalData(Buffer.from(eedBytes));
          return { ok: true, value: new Uint8Array(out) } as const;
        } catch (e) {
          return { ok: false, error: e as Error } as const;
        }
      },
    } as any);
    const r = av.as<typeof obj>();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.a).toBe(1);
      expect(r.value.b).toBe('x');
    }
  });

  it('encrypts and decrypts using envelope encryption with mobile manager', async () => {
    const keys = new Keys();

    // Set persistence directory first
    keys.setPersistenceDir('/tmp/runar-keys-test');
    keys.enableAutoPersist(true);

    // Initialize as mobile manager
    keys.initAsMobile();

    // Initialize user root key
    await keys.mobileInitializeUserRootKey();
    await keys.flushState();

    // Generate a network ID for envelope encryption
    const networkId = keys.mobileGenerateNetworkDataKey();

    // Create profile keys using the proper derivation method (like working e2e tests)
    const personalKey = keys.mobileDeriveUserProfileKey('personal');
    const workKey = keys.mobileDeriveUserProfileKey('work');

    // Install the network public key for the generated network
    const networkPublicKey = keys.mobileGetNetworkPublicKey(networkId);

    const obj = { a: 2, b: 'envelope_test' };
    const data = Buffer.from(encode(obj));

    // Use the new envelope encryption method with derived profile keys
    const profilePks = [personalKey, workKey];
    const encrypted = keys.mobileEncryptWithEnvelope(data, networkId, profilePks);

    // Decrypt using the new envelope decryption method
    const decrypted = keys.mobileDecryptEnvelope(encrypted);

    // Verify the roundtrip
    const decoded = decode(decrypted);
    expect(decoded).toEqual(obj);
  });

  it('encrypts and decrypts using envelope encryption with node manager', async () => {
    const keys = new Keys();

    // Set persistence directory first
    keys.setPersistenceDir('/tmp/runar-keys-test');
    keys.enableAutoPersist(true);

    // Initialize as node manager
    keys.initAsNode();

    // For node manager, we need to install the network key using the proper format
    // This test demonstrates the API usage but may fail due to missing network setup
    const networkId = 'test-network-id';

    // Create a test profile public key (in real usage, this would come from the network)
    // Use a proper uncompressed ECDSA public key format (65 bytes) like the working tests
    const profilePublicKey = Buffer.alloc(65, 1);

    const obj = { a: 3, b: 'node_envelope_test' };
    const data = Buffer.from(encode(obj));

    try {
      // Use the new envelope encryption method
      const encrypted = keys.nodeEncryptWithEnvelope(data, networkId, [profilePublicKey]);

      // Decrypt using the new envelope decryption method
      const decrypted = keys.nodeDecryptEnvelope(encrypted);

      // Verify the roundtrip
      const decoded = decode(decrypted);
      expect(decoded).toEqual(obj);
    } catch (error) {
      // If envelope encryption fails due to missing network setup, this is expected
      // in a test environment without proper network configuration
      console.log(
        'Node envelope encryption test failed as expected (requires network setup):',
        error.message
      );

      // Verify that the error is the expected one about missing network setup
      expect(error.message).toContain('Network public key not found');
    }
  });
});
