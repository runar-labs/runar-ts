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
    join(rustRepo, "target"),
    join(rustRepo, "runar-ffi", "target"),
    join(rustRepo, "runar-node", "target"),
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


