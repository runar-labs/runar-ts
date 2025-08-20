import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { platform, arch } from "node:process";

// Using direct import for Bun runtime
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { dlopen as bunDlopen } from "bun:ffi";
type BunFfiForeignLibrary = ReturnType<typeof bunDlopen>;

export class RunarFfiError extends Error {
  readonly code: number;
  constructor(message: string, code = -1) {
    super(message);
    this.name = "RunarFfiError";
    this.code = code;
  }
}

export type DynamicLibrary = {
  path: string;
};

function detectLibName(): string {
  switch (platform) {
    case "darwin":
      return "librunar_ffi.dylib";
    case "win32":
      return "runar_ffi.dll";
    default:
      return "librunar_ffi.so";
  }
}

function candidatePaths(): string[] {
  const envPath = process.env.RUNAR_FFI_PATH;
  const rustRepo = process.env.RUNAR_RUST_REPO ?? "/home/rafael/Development/runar-rust";
  const libName = detectLibName();
  const candidates: string[] = [];

  if (envPath && existsSync(envPath)) {
    candidates.push(envPath);
  }

  // Try common cargo target dirs
  const arches = [arch];
  const modes = ["debug", "release"];
  const targets = [
    // Prefer package-specific target dirs first to avoid stale workspace libs
    join(rustRepo, "runar-ffi", "target"),
    join(rustRepo, "runar-node", "target"),
    join(rustRepo, "target"),
  ];
  for (const targetDir of targets) {
    for (const mode of modes) {
      const p = join(targetDir, mode, libName);
      if (existsSync(p)) candidates.push(p);
      const nested = join(targetDir, 
        `${platform}-${arch}`, mode, libName);
      if (existsSync(nested)) candidates.push(nested);
    }
  }

  // Local prebuilt artifact path next to package for publishing
  const localPrebuilt = join(
    dirname(new URL(import.meta.url).pathname),
    "..",
    "prebuilt",
    `${platform}-${arch}`,
    detectLibName(),
  );
  if (existsSync(localPrebuilt)) candidates.push(localPrebuilt);

  return candidates;
}

function resolveLibraryPath(): string {
  const list = candidatePaths();
  if (list.length === 0) {
    throw new RunarFfiError(
      "Unable to locate librunar_ffi. Set RUNAR_FFI_PATH or RUNAR_RUST_REPO, or place a prebuilt in prebuilt/<platform-arch>/",
    );
  }
  return list[0]!;
}

export function loadRunarFfi(): DynamicLibrary {
  const libPath = resolveLibraryPath();
  return { path: libPath };
}

export function dlopenRunarFfi<T extends Record<string, any>>(symbols: T): BunFfiForeignLibrary {
  const libPath = resolveLibraryPath();
  // Bun-first: use bun:ffi
  try {
    return bunDlopen(libPath, symbols);
  } catch (err) {
    throw new RunarFfiError(`Failed to dlopen librunar_ffi at ${libPath}: ${(err as Error).message}`);
  }
}

// High-level symbol map for encryption-related FFI
export function openEncryptionFfi() {
  return dlopenRunarFfi({
    rn_keys_new: {
      args: ['ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_new_return: {
      args: ['ptr'],
      returns: 'ptr',
    },
    rn_keys_free: {
      args: ['ptr'],
      returns: 'void',
    },
    rn_last_error: {
      args: ['ptr', 'usize'],
      returns: 'i32',
    },
    rn_keys_set_persistence_dir: { args: ['ptr', 'cstring', 'ptr'], returns: 'i32' },
    rn_keys_enable_auto_persist: { args: ['ptr', 'bool', 'ptr'], returns: 'i32' },
    rn_keys_wipe_persistence: { args: ['ptr', 'ptr'], returns: 'i32' },
    rn_keys_flush_state: { args: ['ptr', 'ptr'], returns: 'i32' },
    rn_keys_node_get_keystore_state: { args: ['ptr', 'ptr', 'ptr'], returns: 'i32' },
    rn_keys_mobile_get_keystore_state: { args: ['ptr', 'ptr', 'ptr'], returns: 'i32' },
    rn_keys_get_keystore_caps: { args: ['ptr', 'ptr', 'ptr'], returns: 'i32' },
    rn_keys_register_linux_device_keystore: { args: ['ptr', 'cstring', 'cstring', 'ptr'], returns: 'i32' },
    rn_keys_encrypt_with_envelope: {
      args: ['ptr', 'ptr', 'usize', 'cstring', 'ptr', 'ptr', 'usize', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_decrypt_envelope: {
      args: ['ptr', 'ptr', 'usize', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_node_get_public_key: {
      args: ['ptr', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_node_get_node_id: {
      args: ['ptr', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_node_generate_csr: {
      args: ['ptr', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_mobile_process_setup_token: {
      args: ['ptr', 'ptr', 'usize', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_node_install_certificate: {
      args: ['ptr', 'ptr', 'usize', 'ptr'],
      returns: 'i32',
    },
    rn_keys_node_install_network_key: { args: ['ptr', 'ptr', 'usize', 'ptr'], returns: 'i32' },
    rn_keys_encrypt_for_public_key: {
      args: ['ptr', 'ptr', 'usize', 'ptr', 'usize', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_encrypt_for_network: {
      args: ['ptr', 'ptr', 'usize', 'cstring', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_decrypt_network_data: {
      args: ['ptr', 'ptr', 'usize', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_encrypt_local_data: {
      args: ['ptr', 'ptr', 'usize', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_decrypt_local_data: {
      args: ['ptr', 'ptr', 'usize', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_mobile_install_network_public_key: { args: ['ptr', 'ptr', 'usize', 'ptr'], returns: 'i32' },
    rn_keys_mobile_generate_network_data_key: { args: ['ptr', 'ptr', 'ptr', 'ptr'], returns: 'i32' },
    rn_keys_mobile_generate_network_data_key_mock: { args: ['ptr', 'ptr', 'ptr', 'ptr'], returns: 'i32' },
    rn_test_cstring_out_ppp: { args: ['ptr', 'ptr', 'ptr'], returns: 'i32' },
    rn_test_cstring_out_pp: { args: ['ptr', 'ptr'], returns: 'i32' },
    rn_test_cstring_return: { args: [], returns: 'cstring' },
    rn_keys_mobile_generate_network_data_key_return: { args: ['ptr'], returns: 'cstring' },
    rn_keys_mobile_generate_network_data_key_bytes: { args: ['ptr', 'ptr', 'ptr', 'ptr'], returns: 'i32' },
    rn_keys_mobile_get_network_public_key: { args: ['ptr', 'cstring', 'ptr', 'ptr', 'ptr'], returns: 'i32' },
    rn_keys_mobile_create_network_key_message: { args: ['ptr', 'cstring', 'ptr', 'usize', 'ptr', 'ptr', 'ptr'], returns: 'i32' },
    rn_free: {
      args: ['ptr', 'usize'],
      returns: 'void',
    },
    rn_string_free: {
      args: ['ptr'],
      returns: 'void',
    },
    rn_keys_mobile_initialize_user_root_key: {
      args: ['ptr', 'ptr'],
      returns: 'i32',
    },
    rn_keys_mobile_derive_user_profile_key: {
      args: ['ptr', 'cstring', 'ptr', 'ptr', 'ptr'],
      returns: 'i32',
    },
  });
}


