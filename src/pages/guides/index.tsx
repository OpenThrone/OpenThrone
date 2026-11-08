import { Box, Button, Group, Text, Title } from '@mantine/core';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import MainArea from '@/components/MainArea';
import { GUIDE_SLUGS } from '@/components/public/GuideDocument';
import PublicHero from '@/components/public/PublicHero';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { serverSideTranslations } from '@/utils/serverTranslations';

export default function GuidesIndex() {
  const { t } = useTranslation('guides');
  return (
    <>
      <SeoHead
        title={t('index.metaTitle')}
        description={t('index.metaDescription')}
      />
      <MainArea title={t('index.title')}>
        <Box className={classes.page}>
          <PublicHero
            title={t('index.title')}
            description={t('index.intro')}
            imageSrc="/assets/images/ui/public/war-table.webp"
          />
          <Box
            component="ol"
            className={classes.guideCards}
            style={{ listStyle: 'none', padding: 0 }}
          >
            {GUIDE_SLUGS.map((slug, index) => (
              <Box component="li" key={slug} className={classes.guideCard}>
                <Text className={classes.guideCardNumber}>
                  {t('common.guideLabel', {
                    number: index + 1,
                    total: GUIDE_SLUGS.length,
                  })}
                </Text>
                <Title order={2} className={classes.highlightTitle}>
                  {t(`index.cards.${slug}.title`)}
                </Title>
                <Text className={classes.prose}>
                  {t(`index.cards.${slug}.summary`)}
                </Text>
                <Button
                  component={Link}
                  href={`/guides/${slug}`}
                  variant="outline"
                >
                  {t('index.read')}
                </Button>
              </Box>
            ))}
          </Box>
          <Box component="section" className={classes.guideFooter} mt="xl">
            <Title order={2} className={classes.sectionTitle}>
              {t('index.moreTitle')}
            </Title>
            <Text className={classes.prose}>{t('index.moreText')}</Text>
            <Group className={classes.actions}>
              <Button component={Link} href="/how-to-play" variant="outline">
                {t('common.howToPlay')}
              </Button>
              <Button component={Link} href="/faq" variant="outline">
                {t('common.faq')}
              </Button>
              <Button component={Link} href="/chronicles" variant="outline">
                {t('common.chronicles')}
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
      'guides',
    ])),
  },
});
