/** Login callbacks must stay on this origin, including after URL decoding. */
export function safeLoginReturnPath(
  value: unknown,
  fallback = '/home/overview',
): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    const target = new URL(value, 'https://local.invalid');
    if (
      !decoded.startsWith('/') ||
      decoded.startsWith('//') ||
      Array.from(decoded).some(
        (character) =>
          character === '\\' ||
          character.charCodeAt(0) <= 32 ||
          character.charCodeAt(0) === 127,
      ) ||
      target.origin !== 'https://local.invalid' ||
      target.pathname.startsWith('//') ||
      // Returning to the login page itself would loop a signed-in visitor.
      /^(\/[a-z]{2})?\/account\/login(\/|$)/i.test(target.pathname)
    )
      return fallback;
    return value;
  } catch {
    return fallback;
  }
}

export function loginHrefForReturn(path: string): string {
  return `/account/login?callbackUrl=${encodeURIComponent(safeLoginReturnPath(path))}`;
}

const LOCALE_SEGMENT = /^\/(en|es|de)(\/|$|[?#])/;

/** Adds the visitor's locale prefix unless the path already carries one. */
export function withLocalePrefix(path: string, prefix: string): string {
  return !prefix || LOCALE_SEGMENT.test(path) ? path : `${prefix}${path}`;
}
