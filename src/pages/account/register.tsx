import {
  Alert,
  Button,
  Group,
  Image,
  SimpleGrid,
  Space,
  Text,
} from '@mantine/core';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { getSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import Form from '@/components/form';
import MainArea from '@/components/MainArea';
import PublicAuthLayout from '@/components/public/PublicAuthLayout';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { useLayout } from '@/context/LayoutContext';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import { getPureCrest, resolveArtworkSource } from '@/utils/artwork';
import { localePrefix } from '@/utils/localeRedirect';
import { serverSideTranslations } from '@/utils/serverTranslations';

const Register = () => {
  const { t } = useTranslation('account');
  const { t: tRuntime } = useTranslation('runtime-controls');
  const { config } = useRuntimeConfig();
  const { setMeta, meta } = useLayout();
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (setMeta && meta && meta.title !== 'OpenThrone - Register') {
      setMeta({
        title: 'OpenThrone - Register',
        description: t('register.metaDescription'),
      });
    }
  }, [meta, setMeta, t]);

  return (
    <>
      <SeoHead
        title="OpenThrone - Register"
        description={t('register.metaDescription')}
      />
      <MainArea title={t('register.title')}>
        <PublicAuthLayout
          title={t('register.forgeNewLegacy')}
          description={t('register.claimRace')}
          formTitle={t('register.createCommanderTitle')}
          sceneChildren={
            <>
              <SimpleGrid cols={4} spacing="sm" mt="xl">
                {['ELF', 'HUMAN', 'GOBLIN', 'UNDEAD'].map((race) => (
                  <Image
                    key={race}
                    src={
                      resolveArtworkSource(
                        `/assets/shields/${race}_150x150.webp`,
                      ) ?? getPureCrest(race)
                    }
                    fallbackSrc={getPureCrest(race)}
                    alt={t(
                      `register.race${race.charAt(0)}${race.slice(1).toLowerCase()}`,
                    )}
                    h={64}
                    fit="contain"
                  />
                ))}
              </SimpleGrid>
              <Text className={classes.prose} mt="xl">
                {t('register.earlyGameDesc')}
              </Text>
              <Group className={classes.actions}>
                <Button
                  component={Link}
                  href="/community/news"
                  variant="outline"
                >
                  {t('register.latestNews')}
                </Button>
                <Button
                  component={Link}
                  href="/account/login"
                  variant="outline"
                >
                  {t('register.alreadyEnlisted')}
                </Button>
              </Group>
            </>
          }
        >
          {errorMessage && (
            <>
              <Alert
                variant="filled"
                color="red"
                title={t('register.registrationFailed')}
                role="alert"
              >
                {errorMessage}
              </Alert>
              <Space h="md" />
            </>
          )}
          {config?.disableRegistration !== false && (
            <>
              <Alert
                variant="filled"
                color="red"
                title={t('register.registrationDisabled')}
                role="alert"
              >
                {config
                  ? t('register.checkDiscordNews')
                  : tRuntime('config.unavailable')}
              </Alert>
              <Space h="md" />
            </>
          )}
          {config?.disableRegistration === false && (
            <Form
              type="register"
              setErrorMessage={setErrorMessage}
              layout="bare"
            />
          )}
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

export default Register;
