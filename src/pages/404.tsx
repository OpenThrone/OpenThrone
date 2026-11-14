import { Box, Button, Group } from '@mantine/core';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import MainArea from '@/components/MainArea';
import PublicHero from '@/components/public/PublicHero';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { serverSideTranslations } from '@/utils/serverTranslations';

export default function NotFoundPage() {
  const { t } = useTranslation('common');

  return (
    <>
      <SeoHead
        title={t('notFound.title')}
        description={t('notFound.description')}
      />
      <MainArea title={t('notFound.title')}>
        <Box className={classes.page}>
          <PublicHero
            title={t('notFound.title')}
            description={t('notFound.description')}
          >
            <Group className={classes.actions}>
              <Button component={Link} href="/">
                {t('notFound.backHome')}
              </Button>
            </Group>
          </PublicHero>
        </Box>
      </MainArea>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', ['common', 'navigation'])),
  },
});
