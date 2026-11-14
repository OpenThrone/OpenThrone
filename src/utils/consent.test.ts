import { describe, expect, it } from 'bun:test';

import {
  buildConsentCookieString,
  CONSENT_COOKIE_MAX_AGE,
  gaCookieClearTargets,
  isMeasurementIdConfigured,
  parseConsentCookie,
  resolveConsentVisibility,
  serializeConsentValue,
  shouldLoadAnalytics,
} from '@/utils/consent';

describe('parseConsentCookie', () => {
  it('reads granted and denied choices of the current version', () => {
    expect(parseConsentCookie('v1.analytics=granted')).toBe('granted');
    expect(parseConsentCookie('v1.analytics=denied')).toBe('denied');
    expect(parseConsentCookie(' v1.analytics=granted ')).toBe('granted');
  });

  it('treats unknown versions and malformed values as no choice yet', () => {
    for (const bad of [
      'v2.analytics=granted',
      'v0.analytics=denied',
      'v1.analytics=maybe',
      'v1.marketing=granted',
      'analytics=granted',
      'v1.analytics=granted; other=1',
      '',
      null,
      undefined,
    ]) {
      expect(parseConsentCookie(bad as string | null)).toBeNull();
    }
  });
});

describe('serializeConsentValue / buildConsentCookieString', () => {
  it('round-trips both choices through the cookie value', () => {
    for (const choice of ['granted', 'denied'] as const) {
      expect(parseConsentCookie(serializeConsentValue(choice))).toBe(choice);
    }
  });

  it('builds a first-party cookie: Path=/, SameSite=Lax, 180 days, Secure on https', () => {
    const secure = buildConsentCookieString('granted', { secure: true });
    expect(secure).toBe(
      `ot_consent=v1.analytics=granted; Max-Age=${CONSENT_COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`,
    );
    expect(CONSENT_COOKIE_MAX_AGE).toBe(180 * 24 * 60 * 60);
    const insecure = buildConsentCookieString('denied', { secure: false });
    expect(insecure).not.toContain('Secure');
    expect(insecure).toContain('SameSite=Lax');
    expect(insecure).toContain('Path=/');
  });
});

describe('isMeasurementIdConfigured', () => {
  it('accepts only well-formed GA4 measurement ids', () => {
    expect(isMeasurementIdConfigured('G-ABC123')).toBe(true);
    expect(isMeasurementIdConfigured(' G-ABC123 ')).toBe(true);
    expect(isMeasurementIdConfigured('')).toBe(false);
    expect(isMeasurementIdConfigured(undefined)).toBe(false);
    expect(isMeasurementIdConfigured('G-abc123')).toBe(false);
    expect(isMeasurementIdConfigured('UA-12345678-1')).toBe(false);
    expect(isMeasurementIdConfigured('G-')).toBe(false);
    expect(isMeasurementIdConfigured('G-123 456')).toBe(false);
  });
});

describe('shouldLoadAnalytics', () => {
  it('never loads on the visual guide or staff pages', () => {
    expect(shouldLoadAnalytics('/test')).toBe(false);
    expect(shouldLoadAnalytics('/home/admin/overview')).toBe(false);
    expect(shouldLoadAnalytics('/home/admin')).toBe(false);
    expect(shouldLoadAnalytics('/home/moderation/reports')).toBe(false);
  });

  it('loads on public and player pages', () => {
    expect(shouldLoadAnalytics('/')).toBe(true);
    expect(shouldLoadAnalytics('/home/overview')).toBe(true);
    expect(shouldLoadAnalytics('/de/userprofile/5')).toBe(true);
  });
});

describe('resolveConsentVisibility', () => {
  const base = {
    measurementConfigured: true,
    storedChoice: null,
    globalPrivacyControl: false,
    pathname: '/',
  };

  it('is fully inert while unconfigured: no banner, no consent', () => {
    const result = resolveConsentVisibility({
      ...base,
      measurementConfigured: false,
    });
    expect(result).toEqual({ showBanner: false, effectiveAnalytics: 'unset' });
  });

  it('shows the banner exactly while no choice is stored', () => {
    expect(resolveConsentVisibility(base)).toEqual({
      showBanner: true,
      effectiveAnalytics: 'unset',
    });
  });

  it('a stored choice wins and the banner never returns', () => {
    expect(
      resolveConsentVisibility({ ...base, storedChoice: 'granted' }),
    ).toEqual({ showBanner: false, effectiveAnalytics: 'granted' });
    expect(
      resolveConsentVisibility({ ...base, storedChoice: 'denied' }),
    ).toEqual({ showBanner: false, effectiveAnalytics: 'denied' });
  });

  it('treats Global Privacy Control with no choice as denied, without a banner', () => {
    expect(
      resolveConsentVisibility({ ...base, globalPrivacyControl: true }),
    ).toEqual({ showBanner: false, effectiveAnalytics: 'denied' });
    // A stored choice still wins over the GPC signal.
    expect(
      resolveConsentVisibility({
        ...base,
        storedChoice: 'granted',
        globalPrivacyControl: true,
      }),
    ).toEqual({ showBanner: false, effectiveAnalytics: 'granted' });
  });

  it('never shows the banner on staff pages or the guide', () => {
    for (const pathname of [
      '/test',
      '/home/admin/traffic',
      '/home/moderation/bans',
    ]) {
      expect(resolveConsentVisibility({ ...base, pathname })).toEqual({
        showBanner: false,
        effectiveAnalytics: 'unset',
      });
    }
  });
});

describe('gaCookieClearTargets', () => {
  it('expires every _ga cookie for the host and the registrable parent', () => {
    const cookieString =
      'ot_consent=v1.analytics=denied; _ga=GA1.1.1; _ga_G-ABC123=GS1.1.2; session=keep';
    expect(gaCookieClearTargets(cookieString, 'alpha.openthrone.dev')).toEqual([
      { name: '_ga', domain: null },
      { name: '_ga', domain: '.alpha.openthrone.dev' },
      { name: '_ga', domain: '.openthrone.dev' },
      { name: '_ga_G-ABC123', domain: null },
      { name: '_ga_G-ABC123', domain: '.alpha.openthrone.dev' },
      { name: '_ga_G-ABC123', domain: '.openthrone.dev' },
    ]);
  });

  it('leaves other cookies and host-only domains alone', () => {
    expect(gaCookieClearTargets('a=1; b=2', 'example.dev')).toEqual([]);
    // Two-label hosts have no wider parent to try.
    const targets = gaCookieClearTargets('_ga=GA1.2.3', 'openthrone.dev');
    expect(targets).toEqual([
      { name: '_ga', domain: null },
      { name: '_ga', domain: '.openthrone.dev' },
    ]);
  });
});
