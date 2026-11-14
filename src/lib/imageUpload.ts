/**
 * In-memory image uploads that run unchanged on Node/Bun and Cloudflare Workers.
 *
 * The previous path spooled multipart uploads to temp files with formidable
 * and read them back from disk. On Workers the filesystem probe passes but
 * the spooled file cannot be read back, so every upload failed as "not a
 * valid image". Uploads here are small (a few MB at most), so the request
 * body is buffered with a hard cap, parsed with the Web-standard
 * `Request.formData()`, validated from memory, and sent to S3-compatible
 * storage through the SDK's fetch handler. Only the optional local-disk
 * storage mode touches the filesystem.
 */
import { createHash } from 'crypto';
import type { IncomingMessage } from 'http';
import imageSize from 'image-size';

/** The request body exceeded the caller's byte cap. */
export class UploadTooLargeError extends Error {}

/** The request was not a parseable multipart/form-data body. */
export class InvalidMultipartError extends Error {}

export interface UploadedFile {
  /** Client-supplied filename: informational only, never used for storage. */
  name: string;
  size: number;
  bytes: Uint8Array;
}

export interface MultipartForm {
  fields: Record<string, string[]>;
  files: Record<string, UploadedFile[]>;
}

export interface ImageInfo {
  width: number;
  height: number;
  type: string;
}

type BodySource = Pick<IncomingMessage, 'headers'> &
  AsyncIterable<Uint8Array | string>;

/** Buffers the request body, refusing anything past `maxBytes`. */
export const readRequestBody = async (
  req: BodySource,
  maxBytes: number,
): Promise<Uint8Array> => {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new UploadTooLargeError('Upload too large');
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes =
      typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    total += bytes.byteLength;
    if (total > maxBytes) throw new UploadTooLargeError('Upload too large');
    chunks.push(bytes);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

/**
 * Parses a multipart/form-data request into string fields and in-memory
 * files. Empty file parts (a file input left blank) are dropped.
 */
export const parseMultipartForm = async (
  req: BodySource,
  { maxBytes }: { maxBytes: number },
): Promise<MultipartForm> => {
  const contentType = req.headers['content-type'];
  if (
    typeof contentType !== 'string' ||
    !contentType.toLowerCase().startsWith('multipart/form-data')
  ) {
    throw new InvalidMultipartError('Expected multipart/form-data');
  }
  const body = await readRequestBody(req, maxBytes);

  let formData: FormData;
  try {
    formData = await new Request('http://upload.invalid/', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: body as unknown as BodyInit,
    }).formData();
  } catch {
    throw new InvalidMultipartError('Malformed multipart body');
  }

  const form: MultipartForm = { fields: {}, files: {} };
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      (form.fields[key] ??= []).push(value);
      continue;
    }
    const file = value as Blob & { name?: string };
    if (file.size === 0 && !file.name) continue;
    (form.files[key] ??= []).push({
      name: file.name ?? '',
      size: file.size,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }
  return form;
};

/** Decodes dimensions and type from the image bytes; null when not an image. */
export const inspectImage = (bytes: Uint8Array): ImageInfo | null => {
  try {
    const { width, height, type } = imageSize(bytes);
    if (!width || !height || !type) return null;
    return { width, height, type };
  } catch {
    return null;
  }
};

/** Lowercase hex SHA-256 of the content (feeds the server-generated name). */
export const sha256Hex = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

/**
 * Stores a public object in the configured S3-compatible bucket. The fetch
 * handler keeps the SDK off Node's http stack, so the same call works on
 * Workers.
 */
export const putPublicObject = async (
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> => {
  const [{ PutObjectCommand, S3Client }, { FetchHttpHandler }] =
    await Promise.all([
      import('@aws-sdk/client-s3'),
      import('@smithy/fetch-http-handler'),
    ]);
  const s3 = new S3Client({
    endpoint: process.env.AWS_S3_ENDPOINT,
    region: process.env.AWS_REGION ?? 'auto',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
    requestHandler: new FetchHttpHandler(),
  });
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME ?? '',
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ContentLength: bytes.byteLength,
      ACL: 'public-read',
    }),
  );
};

/**
 * Writes an upload to local disk (Node/Bun local storage mode only). The
 * caller resolves `filePath` through resolveAvatarPath first.
 */
export const writeLocalFile = async (
  directory: string,
  filePath: string,
  bytes: Uint8Array,
): Promise<void> => {
  const fs = await import('fs');
  await fs.promises.mkdir(directory, { recursive: true });
  await fs.promises.writeFile(filePath, bytes);
};

export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};
