import type { CSSProperties } from 'react';

/** Focal point (percent of the image) and zoom a player chose for their portrait. */
export type AvatarFraming = { x: number; y: number; zoom: number };

export const AVATAR_ZOOM_MIN = 1;
export const AVATAR_ZOOM_MAX = 3;
export const DEFAULT_AVATAR_FRAMING: AvatarFraming = { x: 50, y: 30, zoom: 1 };

// Stored as a URL fragment on users.avatar (e.g. `…/a.png#frame=50,30,1.4`);
// browsers never send the fragment, so every other avatar consumer is unaffected.
const FRAME_PATTERN = /#frame=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Clamps untrusted input into a valid framing, or null when it is not one. */
export function sanitizeAvatarFraming(input: unknown): AvatarFraming | null {
  if (!input || typeof input !== 'object') return null;
  const { x, y, zoom } = input as Record<string, unknown>;
  if (![x, y, zoom].every((v) => typeof v === 'number' && Number.isFinite(v)))
    return null;
  return {
    x: Math.round(clamp(x as number, 0, 100) * 10) / 10,
    y: Math.round(clamp(y as number, 0, 100) * 10) / 10,
    zoom:
      Math.round(
        clamp(zoom as number, AVATAR_ZOOM_MIN, AVATAR_ZOOM_MAX) * 100,
      ) / 100,
  };
}

/** Splits a stored avatar value into the image source and its framing. */
export function splitAvatarFraming(avatar?: string | null): {
  src: string;
  framing: AvatarFraming | null;
} {
  if (!avatar) return { src: '', framing: null };
  const match = avatar.match(FRAME_PATTERN);
  if (!match) return { src: avatar.split('#')[0], framing: null };
  return {
    src: avatar.slice(0, match.index),
    framing: sanitizeAvatarFraming({
      x: Number(match[1]),
      y: Number(match[2]),
      zoom: Number(match[3]),
    }),
  };
}

/** Returns the avatar value with its framing replaced (or removed when null). */
export function withAvatarFraming(
  avatar: string,
  framing: AvatarFraming | null,
): string {
  const { src } = splitAvatarFraming(avatar);
  const clean = sanitizeAvatarFraming(framing);
  return clean ? `${src}#frame=${clean.x},${clean.y},${clean.zoom}` : src;
}

/** Inline styles that apply a framing to an object-fit: cover image. */
export function avatarFramingStyle(
  framing: AvatarFraming | null,
): CSSProperties {
  const { x, y, zoom } = framing ?? DEFAULT_AVATAR_FRAMING;
  return {
    objectPosition: `${x}% ${y}%`,
    transformOrigin: `${x}% ${y}%`,
    transform: zoom > 1 ? `scale(${zoom})` : undefined,
  };
}
