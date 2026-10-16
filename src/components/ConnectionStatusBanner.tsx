import {
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ActionIcon, Button, Flex, Paper, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { memo, useEffect, useState } from 'react';

import { useLayout } from '@/context/LayoutContext';
import useSocket from '@/hooks/useSocket';

function ConnectionStatusBanner() {
  const { t } = useTranslation('common');
  const { raceClasses } = useLayout();
  const { connectionFailed, socket } = useSocket(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!connectionFailed) setDismissed(false);
  }, [connectionFailed]);

  if (!connectionFailed || dismissed) return null;

  const handleRetry = () => {
    socket?.connect();
  };

  const handleDismiss = () => setDismissed(true);

  return (
    <Paper
      role="alert"
      aria-live="assertive"
      px="md"
      py="xs"
      radius={0}
      withBorder
      className={`${raceClasses.borderBottomClass}`}
      style={{
        backgroundColor: 'rgba(220, 38, 38, 0.18)',
        borderColor: 'rgba(220, 38, 38, 0.55)',
      }}
    >
      <Flex align="center" justify="space-between" gap="md">
        <Flex align="center" gap="sm">
          <FontAwesomeIcon
            icon={faTriangleExclamation}
            color="rgb(248, 113, 113)"
            style={{ fontSize: 14 }}
          />
          <Flex direction="column">
            <Text fw={600} size="sm" c="red.2">
              {t('connection.banner.title')}
            </Text>
            <Text size="xs" c="red.3">
              {t('connection.banner.body')}
            </Text>
          </Flex>
        </Flex>
        <Flex align="center" gap="sm">
          <Button
            size="xs"
            variant="filled"
            color="red"
            onClick={handleRetry}
            aria-label={t('connection.banner.retry')}
          >
            {t('connection.banner.retry')}
          </Button>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            onClick={handleDismiss}
            aria-label={t('connection.banner.dismiss')}
          >
            <FontAwesomeIcon icon={faXmark} />
          </ActionIcon>
        </Flex>
      </Flex>
    </Paper>
  );
}

export default memo(ConnectionStatusBanner);
