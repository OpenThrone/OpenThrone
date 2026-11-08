import { describe, expect, it } from 'bun:test';

import {
  loginHrefForReturn,
  safeLoginReturnPath,
  withLocalePrefix,
} from './loginReturn';

const returnPath =
  '/home/supporter?checkout=success&session_id=cs_test_example';

describe('login return paths', () => {
  it('preserves the payment confirmation query and session through login', () => {
    const href = loginHrefForReturn(returnPath);
    expect(href.startsWith('/account/login?callbackUrl=')).toBe(true);
    const callback = new URL(href, 'https://local.invalid').searchParams.get(
      'callbackUrl',
    );
    expect(safeLoginReturnPath(callback)).toBe(returnPath);
  });

  it('preserves locale prefixes and fragments on relative paths', () => {
    expect(
      safeLoginReturnPath(
        '/de/home/supporter?checkout=success&session_id=example#records',
      ),
    ).toBe('/de/home/supporter?checkout=success&session_id=example#records');
    expect(safeLoginReturnPath('/home/settings#forget-account')).toBe(
      '/home/settings#forget-account',
    );
  });

  it.each([
    'https://evil.invalid/home',
    '//evil.invalid',
    '/\\evil.invalid',
    '/%2fevil.invalid',
    '/..//evil.invalid',
    '/%5cevil.invalid',
    '/\nevil.invalid',
    '/%0devil.invalid',
    // eslint-disable-next-line no-script-url -- Untrusted callback regression input.
    'javascript:alert(1)',
    'home/supporter',
    '/bad%escape',
    undefined,
    null,
  ])('rejects unsafe or ambiguous callbacks: %j', (value) => {
    expect(safeLoginReturnPath(value)).toBe('/home/overview');
  });

  it('rejects repeated callback query parameters', () => {
    expect(safeLoginReturnPath(['/home/supporter'])).toBe('/home/overview');
  });

  it('uses the localized fallback supplied by the login page', () => {
    expect(safeLoginReturnPath('//evil.invalid', '/es/home/overview')).toBe(
      '/es/home/overview',
    );
  });

  it('never returns to the login page itself', () => {
    for (const path of [
      '/account/login',
      '/de/account/login?callbackUrl=/home',
      '/account/login/',
    ])
      expect(safeLoginReturnPath(path)).toBe('/home/overview');
    expect(safeLoginReturnPath('/account/login-help')).toBe(
      '/account/login-help',
    );
  });

  it('adds the locale once for a signed-in redirect', () => {
    expect(withLocalePrefix('/home/supporter?x=1', '/de')).toBe(
      '/de/home/supporter?x=1',
    );
    expect(withLocalePrefix('/de/home/supporter', '/de')).toBe(
      '/de/home/supporter',
    );
    expect(withLocalePrefix('/home/overview', '')).toBe('/home/overview');
  });
});
