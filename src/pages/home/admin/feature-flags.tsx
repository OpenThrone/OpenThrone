import {
  Button,
  Group,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import {
  RUNTIME_SETTING_KEYS,
  RUNTIME_SETTING_REGISTRY,
} from '@/constants/runtimeSettings';

type Flag = {
  id: number;
  key: string;
  enabled: boolean;
  description: string | null;
  rules: unknown;
};
const KEYS = RUNTIME_SETTING_KEYS.filter(
  (key) =>
    (key.startsWith('ENABLE_') || key.startsWith('DISABLE_')) &&
    RUNTIME_SETTING_REGISTRY[key].type === 'BOOLEAN',
);

const FeatureFlagsPage = () => {
  const { t } = useTranslation('admin-system');
  const [flags, setFlags] = useState<Flag[]>([]);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/system/feature-flags');
      if (!response.ok) throw new Error('load');
      const items: Flag[] = await response.json();
      setFlags(items);
      setDescriptions(
        Object.fromEntries(
          items.map((item) => [item.key, item.description ?? '']),
        ),
      );
      setError('');
    } catch {
      setError(t('flags.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (
    key: string,
    patch: Partial<Pick<Flag, 'enabled' | 'description'>>,
  ) => {
    setBusyKey(key);
    try {
      const current = flags.find((flag) => flag.key === key);
      const response = await fetch('/api/admin/system/feature-flags', {
        method: current ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          enabled: patch.enabled ?? current?.enabled ?? false,
          description:
            patch.description ??
            current?.description ??
            t(`settings.labels.${key}`),
          rules: null,
        }),
      });
      if (!response.ok) throw new Error('save');
      notifications.show({
        title: t('saved'),
        message: t('flags.saved'),
        color: 'green',
      });
      await load();
    } catch {
      notifications.show({
        title: t('error'),
        message: t('flags.saveError'),
        color: 'red',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const remove = async (key: string) => {
    setBusyKey(key);
    try {
      const response = await fetch(
        `/api/admin/system/feature-flags?key=${encodeURIComponent(key)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('delete');
      await load();
    } catch {
      notifications.show({
        title: t('error'),
        message: t('flags.deleteError'),
        color: 'red',
      });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <AdminLayout
      title={t('flags.title')}
      permissions={['MANAGE_FEATURE_FLAGS']}
    >
      <Stack gap="md">
        <Text c="dimmed">{t('flags.intro')}</Text>
        {error && (
          <Text role="alert" c="red">
            {error}
          </Text>
        )}
        {loading ? (
          <Text>{t('loading')}</Text>
        ) : (
          <Paper withBorder p="md">
            <Table.ScrollContainer minWidth={760}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('key')}</Table.Th>
                    <Table.Th>{t('description')}</Table.Th>
                    <Table.Th>{t('enabled')}</Table.Th>
                    <Table.Th>{t('actions')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {KEYS.map((key) => {
                    const flag = flags.find((item) => item.key === key);
                    return (
                      <Table.Tr key={key}>
                        <Table.Td>
                          {key === 'DISABLE_LOGIN' && (
                            <Button
                              component={Link}
                              href="/home/admin/eras"
                              variant="subtle"
                              size="xs"
                            >
                              {t('settings.resetBeforeLogin')}
                            </Button>
                          )}
                          <Text fw={600}>{t(`settings.labels.${key}`)}</Text>
                          <Text size="xs" c="dimmed">
                            {key}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group align="flex-end" wrap="nowrap">
                            <Textarea
                              aria-label={`${t('description')}: ${key}`}
                              maxLength={1000}
                              autosize
                              minRows={1}
                              maxRows={3}
                              value={
                                descriptions[key] ?? flag?.description ?? ''
                              }
                              onChange={(event) =>
                                setDescriptions((old) => ({
                                  ...old,
                                  [key]: event.currentTarget.value,
                                }))
                              }
                            />
                            <Button
                              size="xs"
                              variant="light"
                              loading={busyKey === key}
                              onClick={() =>
                                save(key, {
                                  description: descriptions[key] ?? '',
                                })
                              }
                            >
                              {t('save')}
                            </Button>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Switch
                            aria-label={`${t('enabled')}: ${key}`}
                            checked={flag?.enabled ?? false}
                            disabled={busyKey === key}
                            onChange={(event) =>
                              save(key, {
                                enabled: event.currentTarget.checked,
                              })
                            }
                          />
                        </Table.Td>
                        <Table.Td>
                          {flag && (
                            <Button
                              size="xs"
                              color="red"
                              variant="subtle"
                              loading={busyKey === key}
                              onClick={() => remove(key)}
                            >
                              {t('delete')}
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}
      </Stack>
    </AdminLayout>
  );
};

export const getServerSideProps = async ({ locale }: { locale?: string }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-system',
    ])),
  },
});
export default FeatureFlagsPage;
