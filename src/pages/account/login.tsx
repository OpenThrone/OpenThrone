/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import { Alert, Box, Button, Group, SimpleGrid, Space, Text } from '@mantine/core';
import { faKey, faShieldHalved } from '@fortawesome/free-solid-svg-icons';

import Form from '@/components/form';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import VacationModeModal from '@/components/VacationModeModal';
import { useLayout } from '@/context/LayoutContext';

const Login = () => {
  const { setMeta, meta } = useLayout();
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [vacationUserId, setVacationUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (setMeta && meta && meta.title !== "OpenThrone - Login") {
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
      // Optionally set userId if you want to pass it to the modal
    } else if (params.get('error') === 'account_status') {
      setErrorMessage('Your account is currently restricted. Please contact support if you believe this is a mistake.');
    }
  }, []);

  return (
    <MainArea title="Login">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <div className="public-rise">
            <GameCard title="Return to the War Room" icon={faKey} goldAccent={false}>
              <Text size="sm" c="gray.3" lh={1.7}>
                Your realm is waiting. Review intelligence briefings, command your troops, and keep your alliances strong.
              </Text>
              <Box mt="md">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.3em' }}>
                  Before You Enter
                </Text>
                <Text size="sm" c="gray.4" mt="xs">
                  New to OpenThrone? Start with a protected onboarding window and a fully guided first day.
                </Text>
              </Box>
              <Group mt="md">
                <Button component={Link} href="/account/register" size="sm" color="yellow">
                  Create a Commander
                </Button>
                <Button component={Link} href="/community/news" size="sm" variant="outline" color="gray">
                  Latest News
                </Button>
              </Group>
            </GameCard>
          </div>

          <div className="public-rise public-rise-delay-1">
            <GameCard title="Commander Access" icon={faShieldHalved}>
              {errorMessage && (
                <>
                  <Alert variant="filled" color="red" title="Access Denied">
                    {errorMessage}
                  </Alert>
                  <Space h="md" />
                </>
              )}
              {(process.env.NEXT_PUBLIC_DISABLE_LOGIN === 'true') && (
                <>
                  <Alert variant="filled" color="red" title="Login is disabled">
                    Please check Discord or our News for updates.
                  </Alert>
                  <Space h="md" />
                </>
              )}
              <Form type="login" setErrorMessage={setErrorMessage} layout="bare" />
              <Group mt="md" justify="center">
                <Button component={Link} href="/account/password-reset" variant="subtle" size="xs" color="gray">
                  Recover a Lost Account
                </Button>
              </Group>
            </GameCard>
          </div>
        </SimpleGrid>
      </div>
      <VacationModeModal
        opened={showVacationModal}
        onClose={() => setShowVacationModal(false)}
        userId={Number(vacationUserId)}
        onVacationEnd={() => setShowVacationModal(false)}
      />
    </MainArea>
  );
};

export default Login;
