import { Box, Button, Group, List, Text } from '@mantine/core';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';

import { SectionHeading } from '@/components/game/SectionHeading';
import MainArea from '@/components/MainArea';
import PublicAuthLayout from '@/components/public/PublicAuthLayout';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { serverSideTranslations } from '@/utils/serverTranslations';

/**
 * Public right-to-be-forgotten page: the link target for inactivity emails.
 * Explains what an erasure removes and retains, then routes the visitor to
 * the settings page (signing in first when needed).
 */
const DeleteRequestPage = () => {
  const { t } = useTranslation('account');
  const { status } = useSession();
  const authenticated = status === 'authenticated';

  const loginHref = `/account/login?callbackUrl=${encodeURIComponent(
    '/home/settings#forget-account',
  )}`;

  return (
    <>
      <SeoHead
        title={t('deleteRequest.title')}
        description={t('deleteRequest.metaDescription')}
      />
      <MainArea title={t('deleteRequest.title')}>
        <PublicAuthLayout
          title={t('deleteRequest.title')}
          description={t('deleteRequest.description')}
          formTitle={t('deleteRequest.detailsTitle')}
        >
          <Text className={classes.prose} mb="md">
            {t('deleteRequest.intro')}
          </Text>

          <Box component="section" mb="md">
            <SectionHeading mb="xs">
              {t('deleteRequest.removedTitle')}
            </SectionHeading>
            <List spacing={4} withPadding>
              <List.Item>{t('deleteRequest.removedEmail')}</List.Item>
              <List.Item>{t('deleteRequest.removedPassword')}</List.Item>
              <List.Item>{t('deleteRequest.removedProfile')}</List.Item>
            </List>
          </Box>

          <Box component="section" mb="lg">
            <SectionHeading mb="xs">
              {t('deleteRequest.keptTitle')}
            </SectionHeading>
            <List spacing={4} withPadding>
              <List.Item>{t('deleteRequest.keptHistory')}</List.Item>
              <List.Item>{t('deleteRequest.keptNameReserved')}</List.Item>
              <List.Item>{t('deleteRequest.keptSanctionHash')}</List.Item>
              <List.Item>{t('deleteRequest.keptCooldownHash')}</List.Item>
            </List>
          </Box>

          <Group className={classes.actions}>
            {authenticated ? (
              <Button component={Link} href="/home/settings#forget-account">
                {t('deleteRequest.openSettings')}
              </Button>
            ) : (
              <Button component={Link} href={loginHref}>
                {t('deleteRequest.signInToContinue')}
              </Button>
            )}
            <Button component={Link} href="/" variant="outline">
              {t('deleteRequest.backHome')}
            </Button>
          </Group>
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

export default DeleteRequestPage;
