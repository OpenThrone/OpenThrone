/**
 * Builds the Cloudflare bundle with a committed build-time profile.
 *
 *   bun scripts/cloudflare-build-profile.ts <production|rehearsal>
 *
 * `next build` inlines every NEXT_PUBLIC_* value into the browser bundle and
 * reads them from the shell first, then from local `.env*` files. A build run
 * from a checkout whose `.env` points at staging would otherwise ship staging
 * flags to production. This wrapper loads `config/cloudflare/<profile>.env`
 * over the shell environment and refuses to build when:
 *
 * - the profile holds anything but NEXT_PUBLIC_* values and NEXTAUTH_URL, or
 *   holds NEXT_PUBLIC_TURNSTILE_SECRET (a server secret despite its name);
 * - a local `.env*` file that Next would load sets a NEXT_PUBLIC_* name the
 *   profile does not, since that value would leak into the bundle.
 *
 * It then runs `bun run cloudflare:build` with the merged environment.
 * Exported pure helpers are covered by scripts/cloudflare-build-profile.test.ts.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const PROFILES = ['production', 'rehearsal'] as const;
export type Profile = (typeof PROFILES)[number];

/** Files `next build` loads for NODE_ENV=production, lowest priority first. */
export const NEXT_ENV_FILES = [
  '.env',
  '.env.production',
  '.env.local',
  '.env.production.local',
];

const FORBIDDEN = new Set(['NEXT_PUBLIC_TURNSTILE_SECRET']);

/** Parses KEY=VALUE lines (no quotes or expansion: profiles are plain). */
export const parseEnvFile = (source: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(
      /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );
    if (match) out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
};

/** Names a profile may set; returns the offending names. */
export const invalidProfileKeys = (profile: Record<string, string>) =>
  Object.keys(profile).filter(
    (key) =>
      FORBIDDEN.has(key) ||
      !(key.startsWith('NEXT_PUBLIC_') || key === 'NEXTAUTH_URL'),
  );

/** NEXT_PUBLIC_* names a local env file sets that the profile does not. */
export const uncoveredPublicKeys = (
  profile: Record<string, string>,
  localEnv: Record<string, string>,
) =>
  Object.keys(localEnv).filter(
    (key) => key.startsWith('NEXT_PUBLIC_') && !(key in profile),
  );

const main = () => {
  const name = process.argv[2] as Profile;
  if (!PROFILES.includes(name)) {
    console.error(
      `Usage: bun scripts/cloudflare-build-profile.ts <${PROFILES.join('|')}>`,
    );
    process.exit(2);
  }
  const root = path.resolve(import.meta.dir, '..');
  const profile = parseEnvFile(
    readFileSync(path.join(root, 'config/cloudflare', `${name}.env`), 'utf8'),
  );

  const invalid = invalidProfileKeys(profile);
  if (invalid.length > 0) {
    console.error(
      `Profile ${name} may only hold public build values; remove: ${invalid.join(', ')}`,
    );
    process.exit(1);
  }

  for (const file of NEXT_ENV_FILES) {
    const full = path.join(root, file);
    if (!existsSync(full)) continue;
    const leaked = uncoveredPublicKeys(
      profile,
      parseEnvFile(readFileSync(full, 'utf8')),
    );
    if (leaked.length > 0) {
      // Names only: never print values from local env files.
      console.error(
        `${file} sets ${leaked.join(', ')}, which the ${name} profile does not; add them to config/cloudflare/${name}.env or build from a checkout without that file.`,
      );
      process.exit(1);
    }
  }

  console.log(
    `Building the Cloudflare bundle with the ${name} profile (${Object.keys(profile).length} values)`,
  );
  const result = spawnSync('bun', ['run', 'cloudflare:build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...profile },
  });
  process.exit(result.status ?? 1);
};

if (import.meta.main) main();
