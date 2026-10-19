/**
 * Release version (package.json) and build commit, injected at build time by
 * next.config.js. Production shows e.g. "v0.4.0 (4f08401)"; alpha carries a
 * pre-release version such as "v0.5.0-alpha (bdef263)".
 */
export const formatAppVersion = (version?: string, sha?: string) =>
  version ? `v${version}${sha ? ` (${sha})` : ''}` : '';

export const APP_VERSION_LABEL = formatAppVersion(
  process.env.NEXT_PUBLIC_APP_VERSION,
  process.env.NEXT_PUBLIC_GIT_SHA,
);
