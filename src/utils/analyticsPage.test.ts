import { describe, expect, it } from 'bun:test';

import { sanitizePageView, sanitizeReferrer } from '@/utils/analyticsPage';

describe('sanitizePageView', () => {
  it('keeps plain paths but never the query string or hash', () => {
    expect(
      sanitizePageView({
        origin: 'https://openthrone.dev',
        routePattern: '/home/overview',
        actualPathname: '/home/overview',
      }),
    ).toEqual({
      pageLocation: 'https://openthrone.dev/home/overview',
      pageTitle: 'https://openthrone.dev/home/overview',
    });
  });

  it('strips a query string that carries a token', () => {
    const result = sanitizePageView({
      origin: 'https://openthrone.dev',
      routePattern: '/account/verify',
      actualPathname: '/account/verify',
      // The caller passes location.pathname, but the sanitizer must defend
      // against a path that slipped a search or hash through.
    });
    expect(result.pageLocation).toBe('https://openthrone.dev/account/verify');
    expect(sanitizeReferrer('https://openthrone.dev/reset?token=sekrit')).toBe(
      'https://openthrone.dev/reset',
    );
  });

  it('replaces dynamic segments with the route pattern so ids never leave', () => {
    const result = sanitizePageView({
      origin: 'https://openthrone.dev',
      routePattern: '/userprofile/[id]',
      actualPathname: '/userprofile/42',
    });
    expect(result.pageLocation).toBe('https://openthrone.dev/userprofile/[id]');
    // The title is the generic pattern, never document.title (player names).
    expect(result.pageTitle).toBe('https://openthrone.dev/userprofile/[id]');
  });

  it('keeps the locale prefix, which is not personal data', () => {
    const result = sanitizePageView({
      origin: 'https://openthrone.dev',
      routePattern: '/userprofile/[id]',
      actualPathname: '/de/userprofile/42',
      localePrefix: '/de',
    });
    expect(result.pageLocation).toBe(
      'https://openthrone.dev/de/userprofile/[id]',
    );
    expect(
      sanitizePageView({
        origin: 'https://openthrone.dev',
        routePattern: '/faq',
        actualPathname: '/es/faq',
        localePrefix: '/es',
      }).pageLocation,
    ).toBe('https://openthrone.dev/es/faq');
  });

  it('drops a hash and trailing search from the raw pathname defensively', () => {
    expect(
      sanitizePageView({
        origin: 'https://openthrone.dev',
        routePattern: '/battle/history',
        actualPathname: '/battle/history?report=99#anchor',
      }).pageLocation,
    ).toBe('https://openthrone.dev/battle/history');
  });
});

describe('sanitizeReferrer', () => {
  it('reduces to origin + path without query or hash', () => {
    expect(sanitizeReferrer('https://google.com/search?q=secret#top')).toBe(
      'https://google.com/search',
    );
    expect(sanitizeReferrer('https://discord.com/channels/1/2?x=1')).toBe(
      'https://discord.com/channels/1/2',
    );
  });

  it('returns an empty string for nothing or garbage', () => {
    expect(sanitizeReferrer('')).toBe('');
    expect(sanitizeReferrer(null)).toBe('');
    expect(sanitizeReferrer(undefined)).toBe('');
    expect(sanitizeReferrer('not a url')).toBe('');
  });
});
