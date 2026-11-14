/**
 * Sanitizes locations before they reach Google Analytics.
 *
 * Google must only ever see route patterns, never raw URLs: query strings can
 * carry tokens, hashes are noise, and dynamic segments hold player ids. The
 * page title is also replaced with the route pattern, because some titles
 * contain player names.
 */

export interface SanitizedPageView {
  /** Origin + sanitized path, e.g. `https://example.dev/de/userprofile/[id]`. */
  pageLocation: string;
  /** The generic route pattern used as the title (`/userprofile/[id]`). */
  pageTitle: string;
}

export interface SanitizePageViewInput {
  /** Site origin, e.g. `https://example.dev`. */
  origin: string;
  /** The Next route pattern, e.g. `/userprofile/[id]` (no locale prefix). */
  routePattern: string;
  /** The real pathname, e.g. `/userprofile/42` (query and hash excluded). */
  actualPathname: string;
  /** Locale prefix to keep, e.g. `/de`; empty for the default locale. */
  localePrefix?: string;
}

const DYNAMIC_SEGMENT = /\[[^/]+\]/;

/**
 * Builds the sanitized page location and title for a page view.
 *
 * - query strings and hashes are never included;
 * - dynamic segments are replaced by the route pattern, so player ids, tokens
 *   and report ids never reach Google;
 * - the locale prefix (`/de`, `/es`) is kept because it is not personal data;
 * - the page title is the route pattern, never `document.title`.
 */
export function sanitizePageView(
  input: SanitizePageViewInput,
): SanitizedPageView {
  const { origin, routePattern, actualPathname, localePrefix = '' } = input;
  const path = DYNAMIC_SEGMENT.test(routePattern)
    ? routePattern
    : stripQueryAndHash(actualPathname);
  // The real pathname already carries the locale prefix; the route pattern
  // (used for dynamic routes) does not, so add it there only.
  const prefixedPath =
    path === routePattern && localePrefix && !path.startsWith(localePrefix)
      ? `${localePrefix}${path}`
      : path;
  const pageLocation = `${origin}${prefixedPath}`;
  return { pageLocation, pageTitle: pageLocation };
}

/** Reduces a full URL to its origin + path: no query string, no hash. */
export function sanitizeReferrer(referrer: string | null | undefined): string {
  if (!referrer) return '';
  try {
    const url = new URL(referrer);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}

function stripQueryAndHash(pathname: string): string {
  const [pathOnly] = pathname.split(/[?#]/, 1);
  return pathOnly || '/';
}
