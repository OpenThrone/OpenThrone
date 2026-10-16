import { describe, expect, it, vi } from 'bun:test';

// Reproduce an i18next server instance retaining an older common namespace.
vi.mock('next-i18next/serverSideTranslations', () => ({
  serverSideTranslations: async (locale: string) => ({
    _nextI18Next: {
      initialI18nStore: {
        [locale]: { common: { about: { title: 'Old title' } } },
      },
      initialLocale: locale,
      ns: ['common'],
      userConfig: null,
    },
  }),
}));

const { serverSideTranslations } = await import('./serverTranslations');

describe('fresh public translations', () => {
  for (const locale of ['en', 'es', 'de']) {
    it(`replaces stale ${locale} resources with complete About and operator copy`, async () => {
      const result = await serverSideTranslations(locale, ['common']);
      const { common } = result._nextI18Next.initialI18nStore[locale];
      expect(common.about.beginYourReign).toBeString();
      expect(common.about.learnToPlay).toBeString();
      expect(common.footer.operator).toContain('AIOXperts IT Solutions LLC');
      expect(common.about.title).not.toBe('Old title');
    });
  }
});
