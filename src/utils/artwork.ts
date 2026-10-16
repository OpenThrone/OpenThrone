import artworkManifest from '../../docs/artwork/manifest.json';
import { getArtworkPreviewMode } from './artworkPreview';

const ARTWORK_HASHES = new Map<string, string>(
  artworkManifest.map((item: { key: string; sha256: string }) => [
    item.key,
    item.sha256,
  ]),
);

/** Artwork is optional; the public base URL is never an S3 API endpoint. */
export const ARTWORK_PREFIX = 'artwork/v1';

/** Bypass cached misses from before this artwork release was uploaded. */
export function getArtworkPublicPath(
  key: string,
  revision = ARTWORK_HASHES.get(key) ?? '1',
): string {
  return key.startsWith(`${ARTWORK_PREFIX}/`) ? `${key}?v=${revision}` : key;
}

export const PURE_ARTWORK =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';

export function getArtworkBaseUrl(): string | null {
  const preview = getArtworkPreviewMode();
  if (
    preview === 'pure' ||
    (preview === 'default' && process.env.NEXT_PUBLIC_ARTWORK_MODE === 'pure')
  )
    return null;
  const configured = process.env.NEXT_PUBLIC_ARTWORK_BASE_URL;
  const legacy =
    process.env.NEXT_PUBLIC_USE_AWS === 'true'
      ? process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT
      : undefined;
  const value =
    configured ||
    legacy ||
    (preview === 'r2' ? 'https://assets.openthrone.dev' : undefined);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return url.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** Accept only relative object keys, never arbitrary URLs or traversal. */
export function getArtworkUrl(key: string): string | null {
  const base = getArtworkBaseUrl();
  if (
    !base ||
    !/^[a-zA-Z0-9_./-]+$/.test(key) ||
    key.startsWith('/') ||
    key.split('/').some((part) => !part || part === '..' || part === '.')
  )
    return null;
  return `${base}/${getArtworkPublicPath(key)}`;
}

export function resolveArtworkSource(source: string): string | null {
  if (source.startsWith('/assets/'))
    return getArtworkUrl(`${ARTWORK_PREFIX}${source}`);
  if (source === PURE_ARTWORK) return null;
  return source;
}

/** Small code-authored crest for existing avatar consumers that require an image URL. */
export function getPureCrest(race = 'ELF'): string {
  const colors: Record<string, string> = {
    ELF: '#004d26',
    HUMAN: '#002f4d',
    UNDEAD: '#0d0d0d',
    GOBLIN: '#4d0000',
  };
  const color = colors[race] ?? colors.ELF;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 112"><path fill="${color}" stroke="#eaae2b" stroke-width="4" d="M8 8H92V56Q92 84 50 104Q8 84 8 56Z"/><path fill="none" stroke="#eaae2b" stroke-width="3" d="M28 38L36 59H64L72 38L58 47L50 29L42 47Z"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
