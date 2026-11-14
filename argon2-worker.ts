/**
 * Argon2 verification sidecar worker.
 *
 * The main OpenThrone worker cannot verify legacy password hashes: production
 * hashes use the native argon2 defaults (m=65536 — 64 MiB of wasm linear
 * memory), which together with the Next.js handler heap exceeds the 128 MiB
 * isolate limit ("Worker exceeds resource limits"). This sidecar keeps an
 * otherwise-empty isolate where the same verification fits comfortably; the
 * app calls it through the ARGON2_VERIFY service binding for hashes with
 * m >= 32 MiB only (small hashes verify locally in the app).
 *
 * Not publicly routable (workers_dev disabled in wrangler.argon2.jsonc) and
 * reachable only from same-account workers via the service binding.
 */

// Same injection as worker.ts — the patched hash-wasm resolves its modules
// from these globals instead of compiling base64 at runtime.
// @ts-expect-error - wasm module binding emitted by wrangler
// eslint-disable-next-line import/extensions -- wrangler wasm module import
import argon2Wasm from './prisma-generated/argon2.wasm';
// @ts-expect-error - wasm module binding emitted by wrangler
// eslint-disable-next-line import/extensions -- wrangler wasm module import
import blake2bWasm from './prisma-generated/blake2b.wasm';

type Env = Record<string, never>;

(
  globalThis as unknown as {
    __OT_HASH_WASM_MODULES__?: Record<string, WebAssembly.Module>;
  }
).__OT_HASH_WASM_MODULES__ = { argon2: argon2Wasm, blake2b: blake2bWasm };

const ARGON2_ENCODED =
  /^\$argon2(id|i|d)\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;
const MAX_PASSWORD_LENGTH = 1024;

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/verify') {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    let body: { hash?: unknown; password?: unknown };
    try {
      body = (await request.json()) as { hash?: unknown; password?: unknown };
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 });
    }
    const { hash, password } = body;
    if (
      typeof hash !== 'string' ||
      typeof password !== 'string' ||
      password.length > MAX_PASSWORD_LENGTH ||
      !ARGON2_ENCODED.test(hash)
    ) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    // The m threshold mirrors the app-side routing decision: anything sent
    // here is expensive by definition, so reject cheap hashes too — callers
    // must not offload ordinary work onto this isolate.
    const memoryKiB = Number(ARGON2_ENCODED.exec(hash)?.[2] ?? 0);
    if (memoryKiB < 32768) {
      return Response.json({ error: 'hash_below_threshold' }, { status: 400 });
    }

    const { verifyPassword } = await import('./src/lib/passwordHash');
    let ok = false;
    try {
      ok = await verifyPassword(hash, password);
    } catch {
      ok = false;
    }
    // Never echo inputs; a bare boolean is all the caller needs.
    return Response.json({ ok });
  },
};
