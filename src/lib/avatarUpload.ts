/**
 * Avatar storage selection.
 *
 * Chooses between S3-compatible and local-disk avatar storage. Uploads are
 * parsed and validated in memory (`@/lib/imageUpload`), so only the local-disk
 * mode needs a filesystem; `localAvatarStorageAvailable` reports whether this
 * runtime has a usable one (Cloudflare Workers does not), so routes can answer
 * with a clean 503 instead of failing mid-upload.
 */

export type AvatarStorageDriver = 'local' | 's3';

const isS3SelectedByLegacyEnv = (): boolean =>
  process.env.NEXT_PUBLIC_USE_AWS === 'true';

/**
 * Resolves the storage driver from OT_AVATAR_STORAGE ('local' | 's3' | 'auto').
 * 'auto' (the default) keeps the historical behavior: S3 when the legacy
 * NEXT_PUBLIC_USE_AWS flag is set, local disk otherwise.
 */
export const resolveAvatarStorageDriver = (): AvatarStorageDriver => {
  const mode = process.env.OT_AVATAR_STORAGE;
  if (mode === 's3') return 's3';
  if (mode === 'local') return 'local';
  return isS3SelectedByLegacyEnv() ? 's3' : 'local';
};

/**
 * Whether this runtime can actually run the local upload path: a usable fs
 * module (spooling + rename + read streams) and process.cwd. Presence of fs
 * exports is not enough — runtimes like workerd (nodejs_compat) provide
 * stubs — so the probe also performs a real fs call (realpath of the cwd)
 * and requires it to succeed.
 */
const fsSupportsLocalUploads = async (): Promise<boolean> => {
  try {
    const fsModule = (await import('fs')) as {
      createReadStream?: unknown;
      promises?: { rename?: unknown; realpath?: unknown };
    };
    if (
      typeof process.cwd !== 'function' ||
      typeof fsModule.createReadStream !== 'function' ||
      typeof fsModule.promises?.rename !== 'function' ||
      typeof fsModule.promises?.realpath !== 'function'
    ) {
      return false;
    }
    await (
      fsModule.promises as { realpath: (p: string) => Promise<unknown> }
    ).realpath(process.cwd());
    return true;
  } catch {
    return false;
  }
};

let localStorageProbe: Promise<boolean> | null = null;

/**
 * Whether local-disk avatar storage can run here (cached after the first
 * probe). S3 storage needs no filesystem and works on every runtime.
 */
export const localAvatarStorageAvailable = (): Promise<boolean> => {
  localStorageProbe ??= fsSupportsLocalUploads();
  return localStorageProbe;
};

/** Test-only: forgets the cached filesystem probe result. */
export const __resetAvatarUploadCacheForTests = (): void => {
  localStorageProbe = null;
};
