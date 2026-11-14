/**
 * Cookie-consent primitives for the optional Google Analytics integration.
 *
 * Pure on purpose: no document access here, so tests and the /test guide can
 * drive the logic directly. Stateful helpers (reading/writing the cookie,
 * clearing Google cookies) live in thin wrappers.
 */

/** Name of the first-party cookie that stores the visitor's choice. */
export const CONSENT_COOKIE_NAME = 'ot_consent';

/** The consent cookie's format version; bump when the value format changes. */
export const CONSENT_COOKIE_VERSION = 1;

/** How long the visitor's choice is kept, in seconds (180 days). */
export const CONSENT_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

export type ConsentChoice = 'granted' | 'denied';

/** `GA_MEASUREMENT_ID` must look like `G-XXXX…` before anything is shown. */
export const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

/** A choice the user has not made yet (also: unknown version, malformed value). */
export type UnsetConsent = 'unset';

/** The consent state the rest of the app acts on. */
export type EffectiveConsent = ConsentChoice | UnsetConsent;

/**
 * Parses a raw `ot_consent` cookie value. Accepts `v1.analytics=granted` and
 * `v1.analytics=denied`; anything else (missing, wrong version, malformed)
 * counts as "no choice yet" and returns null.
 */
export function parseConsentCookie(
  value: string | null | undefined,
): ConsentChoice | null {
  if (!value) return null;
  const match = /^v(\d+)\.analytics=(granted|denied)$/.exec(value.trim());
  if (!match) return null;
  if (Number(match[1]) !== CONSENT_COOKIE_VERSION) return null;
  return match[2] as ConsentChoice;
}

/** Serializes a choice into the `v1.analytics=<choice>` cookie value. */
export function serializeConsentValue(choice: ConsentChoice): string {
  return `v${CONSENT_COOKIE_VERSION}.analytics=${choice}`;
}

/** The full `Set-Cookie` style string for the consent cookie (pure builder). */
export function buildConsentCookieString(
  choice: ConsentChoice,
  options: { secure: boolean },
): string {
  const attrs = [
    `${CONSENT_COOKIE_NAME}=${serializeConsentValue(choice)}`,
    `Max-Age=${CONSENT_COOKIE_MAX_AGE}`,
    'Path=/',
    'SameSite=Lax',
  ];
  if (options.secure) attrs.push('Secure');
  return attrs.join('; ');
}

/** True only for well-formed measurement IDs (`G-` plus A-Z/0-9). */
export function isMeasurementIdConfigured(
  measurementId: string | undefined | null,
): boolean {
  return (
    !!measurementId && GA_MEASUREMENT_ID_PATTERN.test(measurementId.trim())
  );
}

/** Routes where Google Analytics is never loaded (staff pages and the guide). */
export function shouldLoadAnalytics(pathname: string): boolean {
  if (pathname === '/test') return false;
  if (pathname.startsWith('/home/admin')) return false;
  if (pathname.startsWith('/home/moderation')) return false;
  return true;
}

export interface ConsentVisibilityInput {
  measurementConfigured: boolean;
  storedChoice: ConsentChoice | null;
  globalPrivacyControl: boolean;
  pathname: string;
}

export interface ConsentVisibility {
  /** Whether the consent banner should render. */
  showBanner: boolean;
  /** The consent state the app acts on. */
  effectiveAnalytics: EffectiveConsent;
}

/**
 * One decision for banner visibility and effective consent:
 * - unconfigured feature: fully inert (no banner, nothing granted);
 * - a stored choice always wins and the banner never returns;
 * - Global Privacy Control with no stored choice counts as denied, and the
 *   user can still opt in later through cookie settings;
 * - otherwise the banner asks.
 * Staff pages and `/test` never show the banner.
 */
export function resolveConsentVisibility(
  input: ConsentVisibilityInput,
): ConsentVisibility {
  const {
    measurementConfigured,
    storedChoice,
    globalPrivacyControl,
    pathname,
  } = input;
  if (!measurementConfigured || !shouldLoadAnalytics(pathname)) {
    return {
      showBanner: false,
      effectiveAnalytics: storedChoice ?? 'unset',
    };
  }
  if (storedChoice) {
    return { showBanner: false, effectiveAnalytics: storedChoice };
  }
  if (globalPrivacyControl) {
    return { showBanner: false, effectiveAnalytics: 'denied' };
  }
  return { showBanner: true, effectiveAnalytics: 'unset' };
}

const GA_COOKIE_PATTERN = /^_ga($|_.+)/;

/**
 * Cookie names plus domains to expire in order to withdraw analytics: every
 * `_ga` / `_ga_<id>` cookie for the current host and the registrable parent
 * domain (so `alpha.example.com` also clears `.example.com`).
 */
export function gaCookieClearTargets(
  cookieString: string,
  hostname: string,
): Array<{ name: string; domain: string | null }> {
  const names = cookieString
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter((name) => GA_COOKIE_PATTERN.test(name));
  const host = hostname.toLowerCase();
  const domains: Array<string | null> = [null, `.${host}`];
  const labels = host.split('.');
  // `example.com` (or `localhost`) has no wider parent to try.
  if (labels.length > 2 && !host.endsWith('localhost')) {
    domains.push(`.${labels.slice(-2).join('.')}`);
  }
  const seen = new Set<string>();
  const targets: Array<{ name: string; domain: string | null }> = [];
  for (const name of names) {
    for (const domain of domains) {
      const key = `${name}@${domain ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ name, domain });
    }
  }
  return targets;
}
