import { Button, Group, Paper, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';

const MaintenancePage = () => {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/system/server-settings');
        if (res.ok) {
          const settings = await res.json();
          const flag = settings.find((s: any) => s.key === 'MAINTENANCE_MODE');
          if (flag) {
            setEnabled(Boolean(flag.value));
            if (typeof flag.value === 'object' && flag.value.message) {
              setMessage(flag.value.message);
            }
          }
        }
      } catch (err) {
        logError('Failed to load maintenance state:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/system/server-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'MAINTENANCE_MODE',
          value: { enabled, message },
          label: 'Maintenance Mode',
          type: 'JSON',
        }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Saved',
          message: 'Maintenance state updated.',
          color: 'green',
        });
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed.',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Maintenance">
        <Text>Loading...</Text>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="System: Maintenance Mode"
      permissions={['MANAGE_SERVER_SETTINGS']}
    >
      <Stack gap="md">
        <Paper p="md" withBorder>
          <Text size="sm" c="dimmed">
            When enabled, non-staff users will see a maintenance page. Use for
            planned downtime.
          </Text>
        </Paper>

        <GameCard title="Settings">
          <Stack>
            <Switch
              label="Maintenance mode active"
              checked={enabled}
              onChange={(e) => setEnabled(e.currentTarget.checked)}
            />
            <Group justify="flex-end">
              <Button onClick={save} loading={saving}>
                Save
              </Button>
            </Group>
          </Stack>
        </GameCard>
      </Stack>
    </AdminLayout>
  );
};

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale ?? 'en', [
        'common',
        'home',
        'navigation',
      ])),
    },
  };
};

export default MaintenancePage;
