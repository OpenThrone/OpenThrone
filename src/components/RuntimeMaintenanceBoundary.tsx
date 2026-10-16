import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';

import { useUser } from '@/context/users';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';

interface RuntimeMaintenanceBoundaryProps {
  children: ReactNode;
}

const isExemptRoute = (path: string) =>
  path === '/account/login' ||
  path.startsWith('/account/appeal') ||
  path.startsWith('/account/password-reset');

export default function RuntimeMaintenanceBoundary({
  children,
}: RuntimeMaintenanceBoundaryProps) {
  const router = useRouter();
  const { user } = useUser();
  const { t } = useTranslation('runtime-controls');
  const { config, mutate } = useRuntimeConfig();
  const staffRoles = user?.staffRoles;
  const isStaff =
    Array.isArray(staffRoles) &&
    staffRoles.some((role) => role === 'ADMINISTRATOR' || role === 'MODERATOR');
  if (
    !config?.maintenance.enabled ||
    isStaff ||
    isExemptRoute(router.pathname)
  ) {
    return <>{children}</>;
  }

  return (
    <Stack component="main" maw={760} mx="auto" px="md" py="xl" w="100%">
      <Alert
        color="yellow"
        role="status"
        title={t('maintenance.title')}
        variant="light"
      >
        <Text style={{ overflowWrap: 'anywhere' }}>
          {config.maintenance.message || t('maintenance.message')}
        </Text>
      </Alert>
      <Group>
        <Button component={Link} href="/account/login" variant="outline">
          {t('maintenance.signIn')}
        </Button>
        <Button onClick={() => mutate()} variant="subtle">
          {t('maintenance.retry')}
        </Button>
      </Group>
    </Stack>
  );
}
