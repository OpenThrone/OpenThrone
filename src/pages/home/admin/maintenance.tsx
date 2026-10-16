import {
  Button,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';

const MaintenancePage = () => {
  const { t } = useTranslation('admin-system');
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/system/server-settings');
        if (!res.ok) throw new Error('Could not load maintenance settings');
        const settings = await res.json();
        const flag = settings.find(
          (setting: { key: string }) => setting.key === 'MAINTENANCE_MODE',
        );
        if (flag?.value && typeof flag.value === 'object') {
          setEnabled((flag.value as { enabled?: boolean }).enabled === true);
          setMessage((flag.value as { message?: string }).message ?? '');
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
      if (!res.ok) throw new Error('Save failed');
      notifications.show({
        title: t('saved'),
        message: t('settings.saved'),
        color: 'green',
      });
    } catch {
      notifications.show({
        title: t('error'),
        message: t('settings.saveError'),
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title={t('maintenance.title')}>
        <Text>{t('loading')}</Text>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={t('maintenance.title')}
      permissions={['MANAGE_SERVER_SETTINGS']}
    >
      <Stack gap="md">
        <Paper p="md" withBorder>
          <Text size="sm" c="dimmed">
            {t('maintenance.intro')}
          </Text>
        </Paper>

        <GameCard title="Settings">
          <Stack>
            <Switch
              label={t('maintenance.enabled')}
              checked={enabled}
              onChange={(e) => setEnabled(e.currentTarget.checked)}
            />
            <Textarea
              label={t('maintenance.message')}
              description={t('maintenance.messageHelp')}
              maxLength={1000}
              value={message}
              onChange={(event) => setMessage(event.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button onClick={save} loading={saving}>
                {t('save')}
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
        'admin-system',
      ])),
    },
  };
};

export default MaintenancePage;
