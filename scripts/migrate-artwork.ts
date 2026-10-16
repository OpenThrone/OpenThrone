/* eslint-disable no-console -- CLI progress and sanitized failures are intentional. */
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { ARTWORK_PREFIX, getArtworkPublicPath } from '../src/utils/artwork';

// No env values or SDK errors are logged: either can contain credentials.
const upload = process.argv.includes('--upload');
const archive = process.argv.includes('--archive');
const root = path.resolve(import.meta.dir, '..');
const sourceRoot = path.join(root, 'public/assets');
const archiveRoot = path.join(root, 'local/custom-artwork');

async function collect(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(file)));
    else if (/\.(webp|png|jpe?g|gif|svg)$/i.test(entry.name)) files.push(file);
  }
  return files.sort();
}

const digest = (data: Uint8Array) =>
  createHash('sha256').update(data).digest('hex');
const contentType = (file: string) =>
  ({
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  })[path.extname(file).toLowerCase()];

async function main() {
  if (archive && !upload) throw new Error('Archive requires verified upload.');
  const files = await collect(sourceRoot);
  if (!files.length) {
    console.log('No bundled artwork to migrate. Existing manifest preserved.');
    return;
  }
  const manifest = await Promise.all(
    files.map(async (file) => {
      const relative = path
        .relative(sourceRoot, file)
        .split(path.sep)
        .join('/');
      const bytes = await readFile(file);
      return {
        key: `${ARTWORK_PREFIX}/assets/${relative}`,
        sha256: digest(bytes),
        bytes: bytes.length,
        contentType: contentType(file),
      };
    }),
  );
  if (!upload) {
    console.log(
      `Dry run: ${manifest.length} artwork files, ${manifest.reduce((sum, item) => sum + item.bytes, 0)} bytes. No files changed.`,
    );
    return;
  }
  const required = [
    'AWS_BUCKET_NAME',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length)
    throw new Error(`Missing required variables: ${missing.join(', ')}`);
  const endpoint =
    process.env.ARTWORK_S3_ENDPOINT || process.env.AWS_S3_ENDPOINT;
  if (!endpoint)
    throw new Error('Missing ARTWORK_S3_ENDPOINT (R2 S3 API endpoint).');
  let apiUrl: URL;
  try {
    apiUrl = new URL(endpoint);
  } catch {
    throw new Error(
      'Upload failed: invalid S3 API endpoint. Sources retained.',
    );
  }
  if (
    apiUrl.protocol !== 'https:' ||
    !apiUrl.hostname.endsWith('.r2.cloudflarestorage.com') ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.search ||
    apiUrl.hash ||
    apiUrl.pathname !== '/'
  ) {
    throw new Error(
      'Upload failed: set ARTWORK_S3_ENDPOINT to the Cloudflare R2 S3 API endpoint, not the public image domain. Sources retained.',
    );
  }
  const publicBase =
    process.env.NEXT_PUBLIC_ARTWORK_BASE_URL ||
    process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT;
  if (!publicBase) throw new Error('Missing public artwork base URL.');
  const publicUrl = new URL(publicBase);
  if (
    publicUrl.protocol !== 'https:' ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.search ||
    publicUrl.hash
  )
    throw new Error(
      'Public base URL must be HTTPS without credentials, query, or fragment.',
    );
  const bucket = process.env.AWS_BUCKET_NAME;
  const client = new S3Client({
    endpoint,
    forcePathStyle: true,
    region: process.env.AWS_REGION || 'auto',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  try {
    for (const [index, file] of files.entries()) {
      const item = manifest[index];
      const bytes = await readFile(file);
      // Preserve source material outside public and git before any network operation.
      const backup = path.join(archiveRoot, path.relative(sourceRoot, file));
      await mkdir(path.dirname(backup), { recursive: true });
      await copyFile(file, backup);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: item.key,
            Body: bytes,
            ContentType: item.contentType,
            CacheControl: 'public, max-age=86400',
            IfNoneMatch: '*',
            Metadata: { sha256: item.sha256 },
          }),
        );
      } catch (error) {
        // Idempotent retry: an existing object is accepted only after hash verification.
        if ((error as { name?: string }).name !== 'PreconditionFailed') {
          const failure = error as {
            name?: string;
            $metadata?: { httpStatusCode?: number };
            code?: string;
          };
          // SDK exception names contain only a service error identifier, never its message.
          const name = /^[A-Za-z][A-Za-z0-9]{0,50}$/.test(failure.name ?? '')
            ? failure.name
            : 'StorageError';
          const status = failure.$metadata?.httpStatusCode;
          throw new Error(
            `Upload failed for ${item.key}: ${name}${typeof status === 'number' ? ` (HTTP ${status})` : ''}. Sources retained.`,
          );
        }
      }
      try {
        const stored = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: item.key }),
        );
        if (
          !stored.Body ||
          digest(await stored.Body.transformToByteArray()) !== item.sha256
        )
          throw new Error('Object mismatch');
        const response = await fetch(
          `${publicBase.replace(/\/$/, '')}/${getArtworkPublicPath(item.key, item.sha256)}`,
          { signal: AbortSignal.timeout(30000) },
        );
        if (
          !response.ok ||
          digest(new Uint8Array(await response.arrayBuffer())) !== item.sha256
        )
          throw new Error('Public object mismatch');
      } catch {
        throw new Error(
          `Verification failed for ${item.key}. Sources retained.`,
        );
      }
      console.log(`Verified ${index + 1}/${files.length}: ${item.key}`);
    }
  } finally {
    client.destroy();
  }
  await mkdir(path.join(root, 'docs/artwork'), { recursive: true });
  await writeFile(
    path.join(root, 'docs/artwork/manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  if (archive) {
    // Only remove bundled sources after every S3 AND public URL verification passed.
    for (const [index, file] of files.entries()) {
      if (digest(await readFile(file)) !== manifest[index].sha256)
        throw new Error('Could not archive artwork changed during migration.');
    }
    for (const file of files) {
      const sidecar = `${file}.json`;
      try {
        const data = await readFile(sidecar);
        await writeFile(
          path.join(archiveRoot, `${path.relative(sourceRoot, file)}.json`),
          data,
        );
        await unlink(sidecar);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error('Could not archive artwork provenance.');
      }
      await unlink(file);
    }
    console.log('Bundled artwork archived in ignored local/custom-artwork.');
  }
}

main().catch((error) => {
  // Only messages authored above are safe to display.
  const message =
    error instanceof Error &&
    /^(Missing |Archive |Public base |Upload failed |Verification failed |Could not archive)/.test(
      error.message,
    )
      ? error.message
      : 'Artwork migration failed. Original artwork remains available; inspect configuration privately.';
  console.error(message);
  process.exitCode = 1;
});
