import { afterAll, describe, expect, it, mock, vi } from 'bun:test';
import { readFileSync } from 'fs';
import path from 'path';

const productionConfig = require('@/services/RuntimeConfig.service');
const productionTranslations = require('@/utils/serverTranslations');

// Shared like the loaded i18n resources are, so a mutation would show up.
const sharedPrivacy = {
  sections: { use: { body: ['without analytics'] } },
  analyticsSections: { use: { body: ['with Google Analytics'] } },
};

let runtime: () => Promise<unknown> = async () => ({
  enableSiteAnalytics: false,
});
const configStub = {
  ...productionConfig,
  getRuntimeConfig: vi.fn(() => runtime()),
};
const translationsStub = {
  ...productionTranslations,
  serverSideTranslations: vi.fn(async () => ({
    _nextI18Next: {
      initialI18nStore: {
        en: { common: { ok: 'ok' }, privacy: sharedPrivacy },
        de: { privacy: sharedPrivacy },
      },
    },
  })),
};
mock.module('@/services/RuntimeConfig.service', () => configStub);
mock.module('@/utils/serverTranslations', () => translationsStub);
const { getServerSideProps } = require('@/pages/legal/privacy');

afterAll(() => {
  configStub.getRuntimeConfig = productionConfig.getRuntimeConfig;
  translationsStub.serverSideTranslations =
    productionTranslations.serverSideTranslations;
});

const propsFor = async () =>
  (await getServerSideProps({ locale: 'en' } as never)).props as {
    siteAnalytics: boolean;
    _nextI18Next: { initialI18nStore: Record<string, any> };
  };

describe('privacy policy follows the ENABLE_SITE_ANALYTICS setting', () => {
  it('shows the wording without analytics while the setting is off', async () => {
    runtime = async () => ({ enableSiteAnalytics: false });
    expect((await propsFor()).siteAnalytics).toBe(false);
  });

  it('shows the analytics wording once the setting is on', async () => {
    runtime = async () => ({ enableSiteAnalytics: true });
    expect((await propsFor()).siteAnalytics).toBe(true);
  });

  it('leaves the unpublished wording out of the page source while off', async () => {
    runtime = async () => ({ enableSiteAnalytics: false });
    const store = (await propsFor())._nextI18Next.initialI18nStore;
    expect(JSON.stringify(store)).not.toContain('Google Analytics');
    expect(store.en.privacy.sections.use.body).toEqual(['without analytics']);
    expect(store.en.common).toEqual({ ok: 'ok' });
    // The shared resources stay intact for the next request with it on.
    expect(sharedPrivacy.analyticsSections).toBeDefined();
    runtime = async () => ({ enableSiteAnalytics: true });
    expect(
      JSON.stringify((await propsFor())._nextI18Next.initialI18nStore),
    ).toContain('Google Analytics');
  });

  it('falls back to the wording without analytics if settings fail', async () => {
    runtime = async () => {
      throw new Error('database down');
    };
    expect((await propsFor()).siteAnalytics).toBe(false);
  });
});

describe('privacy policy wording per locale', () => {
  for (const locale of ['en', 'de', 'es']) {
    const file = JSON.parse(
      readFileSync(
        path.join(process.cwd(), 'public/locales', locale, 'privacy.json'),
        'utf8',
      ),
    );

    it(`${locale}: the default wording never mentions Google Analytics`, () => {
      expect(JSON.stringify(file.sections)).not.toContain('Google Analytics');
    });

    it(`${locale}: every switched section has analytics wording`, () => {
      for (const section of ['collect', 'use', 'cookies', 'share']) {
        const body = file.analyticsSections?.[section]?.body;
        expect(Array.isArray(body) && body.length > 0).toBe(true);
      }
      expect(JSON.stringify(file.analyticsSections)).toContain(
        'Google Analytics',
      );
    });
  }
});
