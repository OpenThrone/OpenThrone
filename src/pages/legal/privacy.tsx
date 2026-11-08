import { Box, Button, Group, Text, Title } from '@mantine/core';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'next-i18next';

import MainArea from '@/components/MainArea';
import PublicHero from '@/components/public/PublicHero';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { serverSideTranslations } from '@/utils/serverTranslations';

/** Bump with any change to the policy wording. */
const UPDATED = '2026-10-29';

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
export default function PrivacyPolicy() {
  const { t, i18n } = useTranslation('privacy');
  return (
    <>
      <SeoHead title={t('metaTitle')} description={t('metaDescription')} />
      <MainArea title={t('title')}>
        <Box className={classes.page}>
          <PublicHero title={t('title')} description={t('intro')}>
            <Text size="sm">
              {t('updated', {
                // Page locale, not the runtime default: the page is static.
                date: new Date(`${UPDATED}T00:00:00Z`).toLocaleDateString(
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
                  t(`sections.${section}.body`, {
                    returnObjects: true,
                  }) as string[]
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

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'privacy',
    ])),
  },
});
