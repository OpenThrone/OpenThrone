/* eslint-disable jsx-a11y/label-has-associated-control */
import { Alert, Button, Group, Space, Text } from '@mantine/core';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { getSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';

import Form from '@/components/form';
import MainArea from '@/components/MainArea';
import PublicAuthLayout from '@/components/public/PublicAuthLayout';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { useLayout } from '@/context/LayoutContext';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import { localePrefix } from '@/utils/localeRedirect';
import { serverSideTranslations } from '@/utils/serverTranslations';

const Login = () => {
  const { t } = useTranslation('account');
  const { config } = useRuntimeConfig();
  const { setMeta, meta } = useLayout();
  const [vacationNotice, setVacationNotice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (setMeta && meta && meta.title !== 'OpenThrone - Login') {
      setMeta({
        title: 'OpenThrone - Login',
        description: t('login.metaDescription'),
      });
    }
  }, [meta, setMeta, t]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('vacation') === '1') {
      setVacationNotice(true);
    } else if (params.get('error') === 'account_status') {
      setErrorMessage(t('login.accountRestricted'));
    }
  }, [t]);

  return (
    <>
      <SeoHead
        title="OpenThrone - Login"
        description={t('login.metaDescription')}
      />
      <MainArea title={t('login.title')}>
        <PublicAuthLayout
          title={t('login.returnToWarRoom')}
          description={t('login.kingdomWaiting')}
          formTitle={t('login.commanderAccess')}
          sceneChildren={
            <>
              <Text className={classes.prose} mt="lg">
                {t('login.newToOpenThrone')}
              </Text>
              <Group className={classes.actions}>
                <Button
                  component={Link}
                  href="/account/register"
                  variant="outline"
                >
                  {t('login.createCommander')}
                </Button>
                <Button
                  component={Link}
                  href="/community/news"
                  variant="outline"
                >
                  {t('login.latestNews')}
                </Button>
              </Group>
            </>
          }
        >
          {vacationNotice && (
            <>
              <Alert
                variant="light"
                color="blue"
                title={t('login.vacationNoticeTitle')}
                role="status"
              >
                {t('login.vacationNotice')}
              </Alert>
              <Space h="md" />
            </>
          )}
          {errorMessage && (
            <>
              <Alert
                variant="filled"
                color="red"
                title={t('login.accessDenied')}
                data-testid="error-message"
                role="alert"
              >
                {errorMessage}
              </Alert>
              <Space h="md" />
            </>
          )}
          {config?.disableLogin === true && (
            <>
              <Alert
                variant="filled"
                color="red"
                title={t('login.loginDisabled')}
                role="alert"
              >
                {t('login.checkDiscordNews')}
              </Alert>
              <Space h="md" />
            </>
          )}
          <Form type="login" setErrorMessage={setErrorMessage} layout="bare" />
          <Group mt="md" justify="center">
            <Button
              component={Link}
              href="/account/password-reset"
              variant="outline"
              size="xs"
              color="gray"
            >
              {t('login.recoverLostAccount')}
            </Button>
          </Group>
        </PublicAuthLayout>
      </MainArea>
    </>
  );
};

/** Redirects authenticated users to the game; others get the auth funnel. */
export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context);
  if (session?.user) {
    return {
      redirect: {
        destination: `${localePrefix(context.locale, context.defaultLocale)}/home/overview`,
        permanent: false,
      },
    };
  }
  return {
    props: {
      ...(await serverSideTranslations(context.locale ?? 'en', [
        'common',
        'navigation',
        'account',
        'runtime-controls',
      ])),
    },
  };
};

export default Login;
