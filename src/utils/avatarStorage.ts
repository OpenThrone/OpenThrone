import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const AVATAR_EXTENSIONS = new Set(['jpg', 'png', 'gif', 'webp']);

/** Maps the detected image type (from decoded content, not the client filename) to a stored extension. */
export function avatarExtensionFromImageType(
  imageType: string | undefined,
): string | null {
  const ext = imageType === 'jpeg' ? 'jpg' : imageType;
  return ext && AVATAR_EXTENSIONS.has(ext) ? ext : null;
}

/** Streams a file through SHA-256 and returns the lowercase hex digest. */
export function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

/**
 * Builds the stored avatar name from the server-side user ID and content hash only.
 * The client-supplied filename never reaches the path or the S3 key.
 */
export function buildAvatarFileName(
  userId: number,
  contentSha256: string,
  extension: string,
): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('Invalid avatar owner');
  }
  if (!/^[a-f0-9]{64}$/.test(contentSha256)) {
    throw new Error('Invalid avatar content hash');
  }
  if (!AVATAR_EXTENSIONS.has(extension)) {
    throw new Error('Unsupported avatar extension');
  }
  return `${userId}-${contentSha256.slice(0, 32)}.${extension}`;
}

/** Resolves a file inside the avatar directory and rejects anything that escapes it. */
export function resolveAvatarPath(uploadDir: string, fileName: string): string {
  const root = path.resolve(uploadDir);
  const resolved = path.resolve(root, fileName);
  if (path.dirname(resolved) !== root || path.basename(resolved) !== fileName) {
    throw new Error('Avatar path escapes the upload directory');
  }
  return resolved;
}
