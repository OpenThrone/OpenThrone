/** Public pages available without a player session. */
const PUBLIC_PATH_PATTERNS = [
  /^\/account\/login$/,
  /^\/auth\/logout$/,
  /^\/account\/register$/,
  /^\/account\/password-reset$/,
  /^\/account\/password-reset\/result$/,
  /^\/account\/password-reset\/verify$/,
  /^\/community\/news$/,
  /^\/community\/news\/\d+$/,
  /^\/community\/stats$/,
  /^\/how-to-play$/,
  /^\/faq$/,
  /^\/$/,
  /^\/userprofile\/[a-z0-9]+$/i,
  /^\/recruit\/[a-z0-9]+$/i,
  /^\/auto-recruit$/,
  /^\/battle\/battleSimulator$/,
  /^\/about$/,
  // Linked from emails; the token on the link is the authorization.
  /^\/email\/unsubscribe$/,
] as const;

export const isPublicPath = (path: string | null) => {
  if (!path) return false;
  const pathname = path.split(/[?#]/)[0] ?? '';
  const normalizedPath =
    pathname.replace(/^\/(en|es|de)(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  return PUBLIC_PATH_PATTERNS.some((regex) => regex.test(normalizedPath));
};
