/**
 * Extracts the Prisma query-compiler WebAssembly module to
 * prisma-generated/query_compiler.postgresql.wasm.
 *
 * Prisma ships the compiler only as base64 inside
 * @prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs and
 * compiles it at runtime with `new WebAssembly.Module(bytes)` — which workerd
 * forbids ("Wasm code generation disallowed by embedder"). Cloudflare Workers
 * only execute wasm that ships as a build-time module binding, so worker.ts
 * imports the extracted file (wrangler emits it as a WebAssembly.Module) and
 * injects it via globalThis; scripts/patch-prisma-wasm.ts makes the generated
 * client accept it.
 *
 * Run: bun run prisma-wasm:prepare (also chained into cloudflare:build)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'prisma-generated');
const OUT_FILE = path.join(OUT_DIR, 'query_compiler.postgresql.wasm');

const { wasm } = (await import(
  '@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs'
)) as { wasm: string };

if (typeof wasm !== 'string' || wasm.length === 0) {
  console.error(
    'unexpected @prisma/client runtime shape: no base64 wasm export found',
  );
  process.exit(1);
}

const bytes = Buffer.from(wasm, 'base64');
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, bytes);

// A wasm module starts with the 8-byte magic + version header.
if (bytes.readUInt32LE(0) !== 0x6d736100) {
  console.error('extracted bytes are not a wasm module (bad magic)');
  process.exit(1);
}

console.log(
  `wrote ${path.relative(process.cwd(), OUT_FILE)} (${(bytes.length / 1024 / 1024).toFixed(1)} MiB)`,
);

/**
 * Extracts hash-wasm's argon2 module to prisma-generated/argon2.wasm for the
 * same reason: hash-wasm compiles embedded base64 wasm at runtime with
 * WebAssembly.compile(), which workerd forbids. worker.ts injects the module
 * and scripts/patch-prisma-wasm.ts seeds hash-wasm's module cache with it.
 */
const HASH_WASM_ARGON2 = path.join(
  process.cwd(),
  'node_modules/hash-wasm/dist/argon2.umd.min.js',
);
const OUT_ARGON2 = path.join(OUT_DIR, 'argon2.wasm');

const argon2Source = readFileSync(HASH_WASM_ARGON2, 'utf8');
const argon2Match = argon2Source.match(/name:"argon2",data:"([A-Za-z0-9+/=]+)"/);
if (!argon2Match) {
  console.error(
    'expected argon2 wasm blob not found in hash-wasm dist — version changed; update scripts/extract-prisma-wasm.ts',
  );
  process.exit(1);
}

const argon2Bytes = Buffer.from(argon2Match[1], 'base64');
if (argon2Bytes.readUInt32LE(0) !== 0x6d736100) {
  console.error('extracted hash-wasm bytes are not a wasm module (bad magic)');
  process.exit(1);
}
writeFileSync(OUT_ARGON2, argon2Bytes);
console.log(
  `wrote ${path.relative(process.cwd(), OUT_ARGON2)} (${(argon2Bytes.length / 1024).toFixed(0)} KiB)`,
);

/**
 * hash-wasm's argon2 also loads a companion blake2b module at runtime (the
 * algorithm's initial Blake2b-512 hash) — inject that one as well or the
 * blake2b half still compiles base64 bytes at runtime on workerd.
 */
const HASH_WASM_BLAKE2B = path.join(
  process.cwd(),
  'node_modules/hash-wasm/dist/blake2b.umd.min.js',
);
const OUT_BLAKE2B = path.join(OUT_DIR, 'blake2b.wasm');

const blake2bSource = readFileSync(HASH_WASM_BLAKE2B, 'utf8');
const blake2bMatch = blake2bSource.match(
  /name:"blake2b",data:"([A-Za-z0-9+/=]+)"/,
);
if (!blake2bMatch) {
  console.error(
    'expected blake2b wasm blob not found in hash-wasm dist — version changed; update scripts/extract-prisma-wasm.ts',
  );
  process.exit(1);
}

const blake2bBytes = Buffer.from(blake2bMatch[1], 'base64');
if (blake2bBytes.readUInt32LE(0) !== 0x6d736100) {
  console.error('extracted hash-wasm blake2b bytes are not a wasm module');
  process.exit(1);
}
writeFileSync(OUT_BLAKE2B, blake2bBytes);
console.log(
  `wrote ${path.relative(process.cwd(), OUT_BLAKE2B)} (${(blake2bBytes.length / 1024).toFixed(0)} KiB)`,
);
