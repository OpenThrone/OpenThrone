/* eslint-disable jsx-a11y/label-has-associated-control */
import { faKey, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import {
  Alert,
  Box,
  Button,
  Group,
  SimpleGrid,
  Space,
  Text,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';

import Form from '@/components/form';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import VacationModeModal from '@/components/VacationModeModal';
import { useLayout } from '@/context/LayoutContext';

const Login = () => {
  const { t } = useTranslation('account');
  const { setMeta, meta } = useLayout();
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [vacationUserId, setVacationUserId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (setMeta && meta && meta.title !== 'OpenThrone - Login') {
      setMeta({
        title: 'OpenThrone - Login',
        description: 'Meta Description',
      });
    }
  }, [meta, setMeta]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('vacation') === '1') {
      setShowVacationModal(true);
      const userIdParam = params.get('userId') ?? params.get('userID');
      const parsedUserId = userIdParam ? Number(userIdParam) : null;
      setVacationUserId(
        typeof parsedUserId === 'number' && Number.isFinite(parsedUserId)
          ? parsedUserId
          : null,
      );
    } else if (params.get('error') === 'account_status') {
      setErrorMessage(t('accountRestricted'));
    }
  }, [t]);

  return (
    <MainArea title={t('login.title')}>
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <div className="public-rise">
            <GameCard
              title={t('login.returnToWarRoom')}
              icon={faKey}
              goldAccent={false}
            >
              <Text size="sm" c="gray.3" lh={1.7}>
                {t('login.kingdomWaiting')}
              </Text>
              <Box mt="md">
                <Text
                  size="xs"
                  c="dimmed"
                  tt="uppercase"
                  fw={700}
                  style={{ letterSpacing: '0.3em' }}
                >
                  {t('login.beforeYouEnter')}
                </Text>
                <Text size="sm" c="gray.4" mt="xs">
                  {t('login.newToOpenThrone')}
                </Text>
              </Box>
              <Group mt="md">
                <Button
                  component={Link}
                  href="/account/register"
                  size="sm"
                  color="yellow"
                >
                  {t('login.createCommander')}
                </Button>
                <Button
                  component={Link}
                  href="/community/news"
                  size="sm"
                  variant="outline"
                  color="gray"
                >
                  {t('login.latestNews')}
                </Button>
              </Group>
            </GameCard>
          </div>

          <div className="public-rise public-rise-delay-1">
            <GameCard title={t('login.commanderAccess')} icon={faShieldHalved}>
              {errorMessage && (
                <>
                  <Alert
                    variant="filled"
                    color="red"
                    title={t('login.accessDenied')}
                    data-testid="error-message"
                    role="alert"
                    aria-describedby="login-error-text"
                  >
                    <span id="login-error-text">{errorMessage}</span>
                  </Alert>
                  <Space h="md" />
                </>
              )}
              {process.env.NEXT_PUBLIC_DISABLE_LOGIN === 'true' && (
                <>
                  <Alert
                    variant="filled"
                    color="red"
                    title={t('login.loginDisabled')}
                  >
                    {t('login.checkDiscordNews')}
                  </Alert>
                  <Space h="md" />
                </>
              )}
              <Form
                type="login"
                setErrorMessage={setErrorMessage}
                layout="bare"
              />
              <Group mt="md" justify="center">
                <Button
                  component={Link}
                  href="/account/password-reset"
                  variant="subtle"
                  size="xs"
                  color="gray"
                >
                  {t('login.recoverLostAccount')}
                </Button>
              </Group>
            </GameCard>
          </div>
        </SimpleGrid>
      </div>
      <VacationModeModal
        opened={showVacationModal}
        onClose={() => setShowVacationModal(false)}
        userId={vacationUserId}
        onVacationEnd={() => setShowVacationModal(false)}
      />
    </MainArea>
  );
};

export default Login;
