import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  invalidProfileKeys,
  parseEnvFile,
  PROFILES,
  uncoveredPublicKeys,
} from './cloudflare-build-profile';

const readProfile = (name: string) =>
  parseEnvFile(
    readFileSync(
      path.join(import.meta.dir, '..', 'config/cloudflare', `${name}.env`),
      'utf8',
    ),
  );

describe('cloudflare build profiles', () => {
  it('parses plain, exported and quoted lines and skips comments', () => {
    expect(parseEnvFile('# c\nA=1\nexport B=two\nC="three"\n\nD=\n')).toEqual({
      A: '1',
      B: 'two',
      C: 'three',
      D: '',
    });
  });

  it('rejects secrets and non-public names in a profile', () => {
    expect(
      invalidProfileKeys({
        NEXT_PUBLIC_URL_ROOT: 'x',
        NEXTAUTH_URL: 'x',
        NEXT_PUBLIC_TURNSTILE_SECRET: 'x',
        JWT_SECRET: 'x',
      }),
    ).toEqual(['NEXT_PUBLIC_TURNSTILE_SECRET', 'JWT_SECRET']);
  });

  it('flags local public values the profile would not override', () => {
    expect(
      uncoveredPublicKeys(
        { NEXT_PUBLIC_URL_ROOT: 'a' },
        { NEXT_PUBLIC_URL_ROOT: 'b', NEXT_PUBLIC_EXTRA: 'c', SMTP_HOST: 'd' },
      ),
    ).toEqual(['NEXT_PUBLIC_EXTRA']);
  });

  it.each([...PROFILES])(
    '%s profile is public-only and production-shaped',
    (name) => {
      const profile = readProfile(name);
      expect(invalidProfileKeys(profile)).toEqual([]);
      expect(profile.NEXT_PUBLIC_DISABLE_REGISTRATION).toBe('true');
      expect(profile.NEXT_PUBLIC_USE_AWS).toBe('true');
      expect(profile.NEXT_PUBLIC_REALTIME_TRANSPORT).toBe('do');
      expect(profile.NEXTAUTH_URL).toBe(profile.NEXT_PUBLIC_URL_ROOT);
    },
  );

  it('rehearsal differs from production only in its origin', () => {
    const production = readProfile('production');
    const rehearsal = readProfile('rehearsal');
    const differing = Object.keys(production).filter(
      (key) => production[key] !== rehearsal[key],
    );
    expect(differing.sort()).toEqual(['NEXTAUTH_URL', 'NEXT_PUBLIC_URL_ROOT']);
    expect(Object.keys(rehearsal).sort()).toEqual(
      Object.keys(production).sort(),
    );
    expect(production.NEXT_PUBLIC_URL_ROOT).toBe('https://openthrone.dev');
  });
});
