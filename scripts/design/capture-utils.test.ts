import { describe, expect, test } from 'bun:test';

import { cssUrls, isLoadedStatus } from './capture-utils';

describe('cssUrls', () => {
  test('reads quoted, single-quoted and bare URLs beside gradients', () => {
    expect(
      cssUrls(
        'linear-gradient(red, blue), url("https://a.test/x.webp?v=1"), url(\'/b.png\'), url(/c.svg)',
      ),
    ).toEqual(['https://a.test/x.webp?v=1', '/b.png', '/c.svg']);
  });

  test('keeps escaped quotes inside a data URI (the fallback artwork)', () => {
    // Chromium's computed style for PURE_ARTWORK.
    const computed =
      'url("data:image/svg+xml,%3Csvg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"1\\" height=\\"1\\"/%3E")';
    expect(cssUrls(computed)).toEqual([
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E',
    ]);
  });

  test('returns nothing for values without url()', () => {
    expect(cssUrls('none')).toEqual([]);
    expect(cssUrls('radial-gradient(circle, #000, #fff)')).toEqual([]);
  });
});

describe('isLoadedStatus', () => {
  test('accepts success and not-modified, rejects errors and redirects', () => {
    for (const s of [200, 204, 304]) expect(isLoadedStatus(s)).toBe(true);
    for (const s of [301, 302, 404, 500]) expect(isLoadedStatus(s)).toBe(false);
  });
});
