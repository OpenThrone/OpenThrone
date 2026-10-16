import { Button, Text } from '@mantine/core';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import MainArea from '@/components/MainArea';
import PublicAuthLayout from '@/components/public/PublicAuthLayout';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { serverSideTranslations } from '@/utils/serverTranslations';

const Result = () => {
  const { t } = useTranslation('account');
  return (
    <>
      <SeoHead
        title={t('passwordReset.title')}
        description={t('passwordReset.description')}
      />
      <MainArea title={t('passwordReset.title')}>
        <PublicAuthLayout
          title={t('passwordReset.title')}
          description={t('passwordReset.description')}
          formTitle={t('passwordReset.sendResetLink')}
        >
          <Text className={classes.prose}>{t('passwordReset.resultText')}</Text>
          <Button
            component={Link}
            href="/account/login"
            mt="xl"
            variant="outline"
          >
            {t('login.title')}
          </Button>
        </PublicAuthLayout>
      </MainArea>
    </>
  );
};
export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'account',
    ])),
  },
});
export default Result;
