import { describe, expect, it } from 'bun:test';

import {
  sanitizeAvatarFraming,
  splitAvatarFraming,
  withAvatarFraming,
} from './avatarFraming';

const URL = 'https://assets.openthrone.dev/users/1/avatar/a (Custom).png';

describe('avatarFraming', () => {
  it('round-trips a framing through the avatar value', () => {
    const stored = withAvatarFraming(URL, { x: 40, y: 25.55, zoom: 1.456 });
    expect(stored).toBe(`${URL}#frame=40,25.6,1.46`);
    expect(splitAvatarFraming(stored)).toEqual({
      src: URL,
      framing: { x: 40, y: 25.6, zoom: 1.46 },
    });
  });

  it('replaces an existing framing and removes it when null', () => {
    const stored = withAvatarFraming(URL, { x: 10, y: 10, zoom: 2 });
    expect(withAvatarFraming(stored, { x: 90, y: 0, zoom: 1 })).toBe(
      `${URL}#frame=90,0,1`,
    );
    expect(withAvatarFraming(stored, null)).toBe(URL);
  });

  it('clamps out-of-range values and rejects non-numbers', () => {
    expect(sanitizeAvatarFraming({ x: -5, y: 140, zoom: 9 })).toEqual({
      x: 0,
      y: 100,
      zoom: 3,
    });
    expect(sanitizeAvatarFraming({ x: '1', y: 2, zoom: 1 })).toBeNull();
    expect(sanitizeAvatarFraming({ x: NaN, y: 2, zoom: 1 })).toBeNull();
    expect(sanitizeAvatarFraming(null)).toBeNull();
  });

  it('treats unframed and empty avatars as having no framing', () => {
    expect(splitAvatarFraming(URL)).toEqual({ src: URL, framing: null });
    expect(splitAvatarFraming('SHIELD')).toEqual({
      src: 'SHIELD',
      framing: null,
    });
    expect(splitAvatarFraming(undefined)).toEqual({ src: '', framing: null });
  });
});
