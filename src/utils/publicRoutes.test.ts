import { describe, expect, it } from 'bun:test';

import { isPublicPath } from '@/utils/publicRoutes';

describe('public page access', () => {
  it('allows every public navigation destination and news articles without a session', () => {
    for (const path of [
      '/',
      '/about',
      '/how-to-play',
      '/faq',
      '/community/news',
      '/community/news/42',
      '/battle/results/42',
      '/community/stats',
      '/account/login',
      '/account/register',
      '/account/password-reset',
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
      '/battle/history',
      '/home/admin/content',
      '/community/news/admin',
      '/community/stats/private',
      '/community',
      '/account/settings',
      '/how-to-play/private',
      '/faq/private',
      '/es/home/overview',
      '/api/blog/post',
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
    expect(isPublicPath(null)).toBe(false);
    expect(isPublicPath('')).toBe(false);
  });
});
