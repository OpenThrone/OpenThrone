/**
 * Password and API-token hashing facade.
 *
 * The only hashing entry point for authentication code: argon2id runs through
 * hash-wasm (pure WebAssembly, no native module), so the same build works on
 * Cloudflare Workers (workerd + nodejs_compat) and under Bun/Node. Legacy
 * bcrypt hashes (`$2a$`/`$2b$`/`$2y$`) still verify through bcryptjs.
 *
 * Compatibility contract: `verifyPassword` decodes the parameters embedded in
 * an encoded argon2 hash, so hashes written by the previous native `argon2`
 * package (e.g. `$argon2id$v=19$m=65536,t=3,p=4$...`) keep verifying.
 */

import * as bcrypt from 'bcryptjs';
import { argon2id, argon2Verify } from 'hash-wasm';

const ARGON2_SALT_BYTES = 16;
const ARGON2_HASH_BYTES = 32;

/**
 * Player-password parameters: OWASP first Argon2id recommendation
 * (m=19 MiB, t=2, p=1). The previous native library hashed at m=64 MiB;
 * verifying those legacy hashes still works (parameters travel inside the
 * encoded hash), while new hashes stay inside Workers' 128 MiB memory
 * ceiling with headroom for the rest of the request.
 */
const PASSWORD_PARAMS = { memorySize: 19456, iterations: 2, parallelism: 1 };

/**
 * API-token parameters. Tokens are high-entropy random secrets, so they do
 * not need memory-hardening against dictionary attacks the way low-entropy
 * passwords do; 19 MiB keeps concurrent verifications well inside Workers'
 * 128 MiB memory ceiling. Tokens issued earlier at the native library's
 * m=65536,t=3,p=4 still verify (parameters travel inside the encoded hash).
 */
const API_TOKEN_PARAMS = { memorySize: 19456, iterations: 3, parallelism: 1 };

const BCRYPT_PREFIXES = ['$2a$', '$2b$', '$2y$'] as const;

/**
 * Memory size (KiB) encoded in an argon2 hash string, 0 for non-argon2.
 */
const argon2MemoryKiB = (hash: string): number => {
  const match = /^\$argon2(?:id|i|d)\$v=\d+\$m=(\d+),/.exec(hash);
  return match ? Number(match[1]) : 0;
};

/**
 * Legacy hashes at the native library's defaults (m=65536, 64 MiB of wasm
 * linear memory) do not fit next to the Next.js handler heap inside a
 * Worker's 128 MiB isolate — they verify in the dedicated argon2 sidecar
 * worker instead. Only hashes this heavy are offloaded; everything else
 * verifies locally.
 */
const HEAVY_MEMORY_KIB_THRESHOLD = 32768;

/**
 * Verifies through the ARGON2_VERIFY service binding when available.
 * Returns null when the binding is absent or the call fails, so the caller
 * can fall back to local verification (correct on Node/Bun, where memory is
 * not capped).
 */
const verifyViaSidecar = async (
  hash: string,
  value: string,
): Promise<boolean | null> => {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = getCloudflareContext({ async: false });
    const binding = (
      env as {
        ARGON2_VERIFY?: {
          fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
        };
      }
    ).ARGON2_VERIFY;
    if (!binding) return null;
    const response = await binding.fetch(
      'https://argon2-verify.internal/verify',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hash, password: value }),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { ok?: unknown };
    return data.ok === true;
  } catch {
    return null;
  }
};

/** Whether a stored hash is legacy bcrypt rather than argon2. */
export const isBcryptHash = (hash: string): boolean =>
  BCRYPT_PREFIXES.some((prefix) => hash.startsWith(prefix));

const randomSalt = (): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(ARGON2_SALT_BYTES));

const hashArgon2id = (
  value: string,
  params: { memorySize: number; iterations: number; parallelism: number },
): Promise<string> =>
  argon2id({
    password: value,
    salt: randomSalt(),
    hashLength: ARGON2_HASH_BYTES,
    outputType: 'encoded',
    ...params,
  });

/** Hashes a password with argon2id, producing a standard encoded PHC string. */
export const hashPassword = (password: string): Promise<string> =>
  hashArgon2id(password, PASSWORD_PARAMS);

/**
 * Hashes a peppered API-token secret with the same parameters the native
 * argon2 library used for tokens (argon2id, native defaults).
 */
export const hashApiTokenSecret = (value: string): Promise<string> =>
  hashArgon2id(value, API_TOKEN_PARAMS);

/**
 * Verifies a stored hash (legacy bcrypt or argon2) against a plaintext value.
 * Fails closed: a missing, empty, or malformed stored hash returns false —
 * authentication paths must never turn corrupt credential rows into 500s or
 * into accidental successes.
 */
export const verifyPassword = async (
  hash: string,
  value: string,
): Promise<boolean> => {
  if (typeof hash !== 'string' || hash.length === 0) return false;
  try {
    if (isBcryptHash(hash)) return await bcrypt.compare(value, hash);
    if (argon2MemoryKiB(hash) >= HEAVY_MEMORY_KIB_THRESHOLD) {
      const remote = await verifyViaSidecar(hash, value);
      if (remote !== null) return remote;
    }
    return await argon2Verify({ password: value, hash });
  } catch {
    return false;
  }
};
