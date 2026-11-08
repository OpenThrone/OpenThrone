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
  /^\/chronicles$/,
  /^\/guides(\/[a-z-]+)?$/,
  /^\/$/,
  /^\/userprofile\/[a-z0-9]+$/i,
  /^\/recruit\/[a-z0-9]+$/i,
  /^\/auto-recruit$/,
  /^\/battle\/battleSimulator$/,
  // The report loader enforces public ACLs for anonymous readers.
  /^\/battle\/results\/\d+$/,
  /^\/about$/,
  // Plans and pricing; checkout itself requires a session.
  /^\/supporter$/,
  /^\/legal\/(terms|refunds)$/,
  /^\/legal\/privacy$/,
  // Linked from emails; the token on the link is the authorization.
  /^\/email\/unsubscribe$/,
  /^\/account\/confirm-erasure$/,
  // Signed-out visitors get a sign-in link that keeps the claim token.
  /^\/account\/veteran-claim$/,
] as const;

/**
 * Public reading pages whose text must be in the server-rendered HTML for
 * crawlers. The shell normally holds page content back until the session has
 * loaded; these pages show it straight away (visitors who turn out to be
 * signed in gain the sidebar once their session resolves).
 */
const SERVER_RENDERED_PATH_PATTERNS = [
  /^\/chronicles$/,
  /^\/guides(\/[a-z-]+)?$/,
  /^\/how-to-play$/,
  /^\/faq$/,
  /^\/about$/,
  /^\/legal\/(terms|refunds|privacy)$/,
] as const;

const normalizePath = (path: string) => {
  const pathname = path.split(/[?#]/)[0] ?? '';
  return (
    pathname.replace(/^\/(en|es|de)(?=\/|$)/, '').replace(/\/+$/, '') || '/'
  );
};

export const isServerRenderedPublicPath = (path: string | null) =>
  !!path &&
  SERVER_RENDERED_PATH_PATTERNS.some((regex) =>
    regex.test(normalizePath(path)),
  );

export const isPublicPath = (path: string | null) => {
  if (!path) return false;
  const pathname = path.split(/[?#]/)[0] ?? '';
  const normalizedPath =
    pathname.replace(/^\/(en|es|de)(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  if (process.env.NODE_ENV !== 'production' && normalizedPath === '/test')
    return true;
  return PUBLIC_PATH_PATTERNS.some((regex) => regex.test(normalizedPath));
};
