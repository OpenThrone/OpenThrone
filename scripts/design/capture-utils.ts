/**
 * URLs in a computed CSS image value such as `url("a.webp"), linear-gradient(…)`.
 * Chromium serialises inner quotes as `\"` (the fallback artwork is an inline SVG
 * with quoted attributes), so quoted URLs are read up to the matching quote.
 */
export const cssUrls = (value: string): string[] =>
  [
    ...value.matchAll(
      /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)\s]*))\s*\)/g,
    ),
  ].map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1'));

/** Puppeteer's `ok()` plus 304: a revisited page (overview after login) may come from cache. */
export const isLoadedStatus = (status: number): boolean =>
  status === 0 || (status >= 200 && status < 300) || status === 304;
