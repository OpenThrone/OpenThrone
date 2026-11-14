import { Box, Button, Group, Text, Title } from '@mantine/core';
import type { GetServerSideProps } from 'next';
import { useTranslation } from 'next-i18next';

import MainArea from '@/components/MainArea';
import PublicHero from '@/components/public/PublicHero';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { logError } from '@/utils/logger';
import { serverSideTranslations } from '@/utils/serverTranslations';

/** Bump with any change to the policy wording without site analytics. */
const UPDATED = '2026-11-12';
/**
 * Date of the wording with Google Analytics (`analyticsSections`). Set it to
 * the announced effective date before turning ENABLE_SITE_ANALYTICS on.
 */
const UPDATED_WITH_ANALYTICS = '2026-11-10';

/** Sections whose wording changes when site analytics is on. */
const ANALYTICS_SECTIONS: ReadonlySet<string> = new Set([
  'collect',
  'use',
  'cookies',
  'share',
]);

const SECTIONS = [
  'who',
  'collect',
  'use',
  'cookies',
  'share',
  'transfers',
  'retention',
  'delete',
  'rights',
  'children',
  'security',
  'changes',
] as const;

/** Site-wide privacy policy, linked from the footer and the sign-up form. */
export default function PrivacyPolicy({
  siteAnalytics,
}: {
  siteAnalytics: boolean;
}) {
  const { t, i18n } = useTranslation('privacy');
  const updated = siteAnalytics ? UPDATED_WITH_ANALYTICS : UPDATED;
  return (
    <>
      <SeoHead title={t('metaTitle')} description={t('metaDescription')} />
      <MainArea title={t('title')}>
        <Box className={classes.page}>
          <PublicHero title={t('title')} description={t('intro')}>
            <Text size="sm">
              {t('updated', {
                // Page locale, not the runtime default.
                date: new Date(`${updated}T00:00:00Z`).toLocaleDateString(
                  i18n.language,
                  { timeZone: 'UTC' },
                ),
              })}
            </Text>
          </PublicHero>
          <Box className={classes.chronicle}>
            {SECTIONS.map((section) => (
              <Box component="section" key={section} id={section}>
                <Title order={2} className={classes.sectionTitle}>
                  {t(`sections.${section}.title`)}
                </Title>
                {(
                  t(
                    siteAnalytics && ANALYTICS_SECTIONS.has(section)
                      ? `analyticsSections.${section}.body`
                      : `sections.${section}.body`,
                    { returnObjects: true },
                  ) as string[]
                ).map((paragraph) => (
                  <Text key={paragraph} className={classes.prose}>
                    {paragraph}
                  </Text>
                ))}
              </Box>
            ))}
            <Group className={classes.actions}>
              <Button
                component="a"
                href="mailto:privacy@openthrone.dev"
                variant="outline"
              >
                {t('contactLink')}
              </Button>
            </Group>
          </Box>
        </Box>
      </MainArea>
    </>
  );
}

/**
 * Rendered per request so the wording follows the ENABLE_SITE_ANALYTICS admin
 * setting, which also switches Google Analytics on and off. If the setting
 * cannot be read, the page shows the wording without analytics; the consent
 * banner reads the same setting and stays off in that case too.
 */
export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
  let siteAnalytics = false;
  try {
    siteAnalytics = (await getRuntimeConfig()).enableSiteAnalytics === true;
  } catch (error) {
    logError('Privacy policy could not read the site analytics setting', error);
  }
  const translations = await serverSideTranslations(locale ?? 'en', [
    'common',
    'navigation',
    'privacy',
  ]);
  return {
    props: {
      siteAnalytics,
      ...(siteAnalytics ? translations : withoutAnalyticsWording(translations)),
    },
  };
};

type PageTranslations = Awaited<ReturnType<typeof serverSideTranslations>>;
type Store = Record<string, Record<string, Record<string, unknown>>>;

/**
 * Unpublished wording must not reach the page source either, so it is left
 * out of every locale the page ships (the fallback locale included). Builds
 * new objects: the loaded resources can be shared between requests.
 */
function withoutAnalyticsWording(
  translations: PageTranslations,
): PageTranslations {
  const store = (translations._nextI18Next?.initialI18nStore ?? {}) as Store;
  const filtered: Store = {};
  for (const [lng, namespaces] of Object.entries(store)) {
    const { analyticsSections: _unpublished, ...privacy } =
      namespaces.privacy ?? {};
    filtered[lng] = namespaces.privacy
      ? { ...namespaces, privacy }
      : namespaces;
  }
  return {
    ...translations,
    _nextI18Next: { ...translations._nextI18Next, initialI18nStore: filtered },
  } as PageTranslations;
}
