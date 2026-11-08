import { describe, expect, it } from 'bun:test';

import { isPublicPath, isServerRenderedPublicPath } from '@/utils/publicRoutes';

describe('public page access', () => {
  it('allows every public navigation destination and news articles without a session', () => {
    for (const path of [
      '/',
      '/about',
      '/supporter',
      '/how-to-play',
      '/faq',
      '/chronicles',
      '/guides',
      '/guides/first-kingdom',
      '/community/news',
      '/community/news/42',
      '/battle/results/42',
      '/community/stats',
      '/account/login',
      '/account/register',
      '/account/password-reset',
      // The emailed deletion link is opened by a visitor who may be signed out.
      '/account/confirm-erasure',
      // The veteran claim link keeps its token through sign-in.
      '/account/veteran-claim',
    ]) {
      for (const locale of ['', '/en', '/es', '/de']) {
        expect(isPublicPath(`${locale}${path}`)).toBe(true);
        expect(isPublicPath(`${locale}${path}/?era=2`)).toBe(true);
      }
    }
  });

  it('keeps game, administration, and non-public community routes protected', () => {
    for (const path of [
      '/home/overview',
      '/home/supporter',
      '/supporter/mock-checkout',
      '/battle/history',
      '/home/admin/content',
      '/community/news/admin',
      '/community/stats/private',
      '/community',
      '/account/settings',
      '/how-to-play/private',
      '/faq/private',
      '/chronicles/private',
      '/guides/first-kingdom/private',
      '/guides/Admin',
      '/es/home/overview',
      '/api/blog/post',
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
    expect(isPublicPath(null)).toBe(false);
    expect(isPublicPath('')).toBe(false);
  });
});

describe('server-rendered public pages', () => {
  it('flags the public reading pages in every locale, and nothing else', () => {
    for (const locale of ['', '/en', '/de', '/es']) {
      for (const path of [
        '/chronicles',
        '/guides',
        '/guides/first-kingdom',
        '/guides/combat-spying-stamina/',
        '/how-to-play',
        '/faq',
        '/about',
        '/legal/terms',
        '/legal/refunds',
        '/legal/privacy',
      ]) {
        expect(isServerRenderedPublicPath(`${locale}${path}`)).toBe(true);
      }
    }
    for (const path of [
      '/',
      '/home/overview',
      '/supporter',
      '/legal/other',
      '/guides/first-kingdom/private',
      '/chronicles/private',
      '/community/news/1',
    ]) {
      expect(isServerRenderedPublicPath(path)).toBe(false);
    }
    expect(isServerRenderedPublicPath(null)).toBe(false);
  });
});
