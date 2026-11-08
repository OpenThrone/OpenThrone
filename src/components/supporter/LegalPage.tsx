import { Box, Button, Group, Text, Title } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import MainArea from '@/components/MainArea';
import PublicHero from '@/components/public/PublicHero';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';

/** Bump when the wording of either document changes. */
const UPDATED = '2026-10-29';

export const LEGAL_SECTIONS = {
  terms: [
    'eligibility',
    'purchase',
    'billing',
    'gifts',
    'sponsorship',
    'accounts',
    'disputes',
    'privacy',
    'law',
    'contact',
  ],
  refunds: ['request', 'how', 'cancel', 'gifts'],
} as const;

/** Patronage terms and refund policy, linked from /supporter. */
export default function LegalPage({
  doc,
}: {
  doc: keyof typeof LEGAL_SECTIONS;
}) {
  const { t, i18n } = useTranslation('supporter');
  const title = t(`legal.${doc}.title`);
  return (
    <>
      <SeoHead title={title} description={t(`legal.${doc}.intro`)} />
      <MainArea title={title}>
        <Box className={classes.page}>
          <PublicHero title={title} description={t(`legal.${doc}.intro`)} />
          <Box className={classes.chronicle}>
            {LEGAL_SECTIONS[doc].map((section) => (
              <Box component="section" key={section}>
                <Title order={2} className={classes.sectionTitle}>
                  {t(`legal.${doc}.sections.${section}.title`)}
                </Title>
                <Text className={classes.prose}>
                  {t(`legal.${doc}.sections.${section}.body`)}
                </Text>
              </Box>
            ))}
            <Text size="sm">
              {t('legal.updated', {
                // Page locale, not the runtime default: the page is static.
                date: new Date(`${UPDATED}T00:00:00Z`).toLocaleDateString(
                  i18n.language,
                  { timeZone: 'UTC' },
                ),
              })}
            </Text>
            <Group className={classes.actions}>
              <Button component={Link} href="/supporter" variant="outline">
                {t('legal.back')}
              </Button>
            </Group>
          </Box>
        </Box>
      </MainArea>
    </>
  );
}
