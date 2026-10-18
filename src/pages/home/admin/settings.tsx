import {
  Button,
  Code,
  NumberInput,
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
  type RuntimeSettingKey,
} from '@/constants/runtimeSettings';

type SettingRow = {
  id: number;
  key: string;
  label: string;
  type: string;
  value: unknown;
  isPublic: boolean;
  editable: boolean;
};
type HistoryRow = {
  id: number;
  createdAt: string;
  details: { key?: string; previousValue?: unknown };
};

const ServerSettingsPage = () => {
  const { t } = useTranslation('admin-system');
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rangeDraft, setRangeDraft] = useState(5);
  const [emailRateDraft, setEmailRateDraft] = useState(60);
  const [citizenBonusDraft, setCitizenBonusDraft] = useState(0);
  const [bonusWindowDraft, setBonusWindowDraft] = useState(24);
  const [protectionDaysDraft, setProtectionDaysDraft] = useState(14);
  const [maintenanceDraft, setMaintenanceDraft] = useState({
    enabled: false,
    message: '',
  });

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/system/server-settings');
      if (!response.ok) throw new Error('load');
      const nextRows: SettingRow[] = await response.json();
      setRows(nextRows);
      const range = nextRows.find((row) => row.key === 'ATTACK_LEVEL_RANGE');
      setRangeDraft(typeof range?.value === 'number' ? range.value : 5);
      const citizenBonus = nextRows.find(
        (row) => row.key === 'era.dailyCitizenBonus',
      );
      setCitizenBonusDraft(
        typeof citizenBonus?.value === 'number' ? citizenBonus.value : 0,
      );
      const bonusWindow = nextRows.find(
        (row) => row.key === 'era.dailyCitizenBonusActivityHours',
      );
      setBonusWindowDraft(
        typeof bonusWindow?.value === 'number' ? bonusWindow.value : 24,
      );
      const protectionDays = nextRows.find(
        (row) => row.key === 'era.protectionDurationDays',
      );
      setProtectionDaysDraft(
        typeof protectionDays?.value === 'number' ? protectionDays.value : 14,
      );
      const emailRate = nextRows.find(
        (row) => row.key === 'email.outbox.ratePerMinute',
      );
      setEmailRateDraft(
        typeof emailRate?.value === 'number' ? emailRate.value : 60,
      );
      const maintenance = nextRows.find((row) => row.key === 'MAINTENANCE_MODE')
        ?.value as { enabled?: boolean; message?: string } | undefined;
      setMaintenanceDraft({
        enabled: maintenance?.enabled === true,
        message: maintenance?.message ?? '',
      });
      setMessage('');
    } catch {
      setMessage(t('settings.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const save = async (key: RuntimeSettingKey, value: unknown) => {
    setSavingKey(key);
    try {
      const response = await fetch('/api/admin/system/server-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (!response.ok) throw new Error('save');
      notifications.show({
        title: t('saved'),
        message: t('settings.saved'),
        color: 'green',
      });
      await fetchSettings();
    } catch {
      notifications.show({
        title: t('error'),
        message: t('settings.saveError'),
        color: 'red',
      });
    } finally {
      setSavingKey(null);
    }
  };

  const revert = async (key: RuntimeSettingKey, auditId: number) => {
    try {
      const response = await fetch('/api/admin/system/server-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, revertAuditId: auditId }),
      });
      if (!response.ok) throw new Error('revert');
      notifications.show({
        title: t('saved'),
        message: t('settings.reverted'),
        color: 'green',
      });
      await fetchSettings();
    } catch {
      notifications.show({
        title: t('error'),
        message: t('settings.revertError'),
        color: 'red',
      });
    }
  };

  const loadHistory = async (key: RuntimeSettingKey) => {
    try {
      const response = await fetch(
        `/api/admin/system/server-settings?historyKey=${encodeURIComponent(key)}`,
      );
      if (!response.ok) throw new Error('history');
      const result: HistoryRow[] = await response.json();
      setHistory((current) => ({ ...current, [key]: result }));
    } catch {
      notifications.show({
        title: t('error'),
        message: t('settings.historyError'),
        color: 'red',
      });
    }
  };

  const byKey = new Map(rows.map((row) => [row.key, row]));

  return (
    <AdminLayout
      title={t('settings.title')}
      permissions={['MANAGE_SERVER_SETTINGS']}
    >
      <Stack gap="md">
        <Text c="dimmed">{t('settings.intro')}</Text>
        {message && (
          <Text role="alert" c="red">
            {message}
          </Text>
        )}
        {loading ? (
          <Text>{t('loading')}</Text>
        ) : (
          <Paper withBorder p="md">
            <Table.ScrollContainer minWidth={720}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('key')}</Table.Th>
                    <Table.Th>{t('value')}</Table.Th>
                    <Table.Th>{t('status')}</Table.Th>
                    <Table.Th>{t('actions')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {RUNTIME_SETTING_KEYS.map((key) => {
                    const meta = RUNTIME_SETTING_REGISTRY[key];
                    const row = byKey.get(key);
                    const value = row?.value ?? meta.fallback;
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
                          <Code>{key}</Code>
                          <Text size="xs" c="dimmed">
                            {t(`settings.labels.${key}`)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {key === 'ATTACK_LEVEL_RANGE' ? (
                            <NumberInput
                              aria-label={t(`settings.labels.${key}`)}
                              min={1}
                              max={100}
                              value={rangeDraft}
                              disabled={savingKey === key}
                              onChange={(next) => {
                                if (typeof next === 'number')
                                  setRangeDraft(next);
                              }}
                              onBlur={() => save(key, rangeDraft)}
                            />
                          ) : key === 'email.outbox.ratePerMinute' ? (
                            <NumberInput
                              aria-label={t(`settings.labels.${key}`)}
                              min={1}
                              max={600}
                              value={emailRateDraft}
                              disabled={savingKey === key}
                              onChange={(next) => {
                                if (typeof next === 'number')
                                  setEmailRateDraft(next);
                              }}
                              onBlur={() => save(key, emailRateDraft)}
                            />
                          ) : key === 'era.dailyCitizenBonus' ? (
                            <NumberInput
                              aria-label={t(`settings.labels.${key}`)}
                              min={0}
                              max={100000}
                              step={10}
                              thousandSeparator=","
                              value={citizenBonusDraft}
                              disabled={savingKey === key}
                              onChange={(next) => {
                                if (typeof next === 'number')
                                  setCitizenBonusDraft(next);
                              }}
                              onBlur={() => save(key, citizenBonusDraft)}
                            />
                          ) : key === 'era.dailyCitizenBonusActivityHours' ? (
                            <NumberInput
                              aria-label={t(`settings.labels.${key}`)}
                              min={0}
                              max={720}
                              value={bonusWindowDraft}
                              disabled={savingKey === key}
                              onChange={(next) => {
                                if (typeof next === 'number')
                                  setBonusWindowDraft(next);
                              }}
                              onBlur={() => save(key, bonusWindowDraft)}
                            />
                          ) : key === 'era.protectionDurationDays' ? (
                            <NumberInput
                              aria-label={t(`settings.labels.${key}`)}
                              min={1}
                              max={60}
                              allowDecimal={false}
                              value={protectionDaysDraft}
                              disabled={savingKey === key}
                              onChange={(next) => {
                                if (typeof next === 'number')
                                  setProtectionDaysDraft(next);
                              }}
                              onBlur={() => save(key, protectionDaysDraft)}
                            />
                          ) : key === 'MAINTENANCE_MODE' ? (
                            <Stack gap="xs">
                              <Switch
                                aria-label={t('maintenance.enabled')}
                                checked={maintenanceDraft.enabled}
                                disabled={savingKey === key}
                                onChange={(event) => {
                                  const next = {
                                    ...maintenanceDraft,
                                    enabled: event.currentTarget.checked,
                                  };
                                  setMaintenanceDraft(next);
                                  save(key, next);
                                }}
                              />
                              <Textarea
                                aria-label={t('maintenance.message')}
                                maxLength={1000}
                                value={maintenanceDraft.message}
                                onChange={(event) =>
                                  setMaintenanceDraft((current) => ({
                                    ...current,
                                    message: event.currentTarget.value,
                                  }))
                                }
                                onBlur={() => save(key, maintenanceDraft)}
                              />{' '}
                            </Stack>
                          ) : (
                            <Switch
                              aria-label={t(`settings.labels.${key}`)}
                              checked={Boolean(value)}
                              disabled={savingKey === key}
                              onChange={(event) =>
                                save(key, event.currentTarget.checked)
                              }
                            />
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">
                            {row
                              ? t('settings.databaseValue')
                              : t('settings.environmentDefault')}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="subtle"
                            onClick={() => loadHistory(key)}
                          >
                            {t('settings.history')}
                          </Button>
                          {history[key]?.[0] && (
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => revert(key, history[key][0].id)}
                            >
                              {t('settings.revertLatest')}
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                  {rows
                    .filter(
                      (row) =>
                        !RUNTIME_SETTING_KEYS.includes(
                          row.key as RuntimeSettingKey,
                        ),
                    )
                    .map((row) => (
                      <Table.Tr key={row.id}>
                        <Table.Td>
                          <Code>{row.key}</Code>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" lineClamp={2}>
                            {JSON.stringify(row.value)}
                          </Text>
                        </Table.Td>
                        <Table.Td>{t('settings.unknownReadOnly')}</Table.Td>
                        <Table.Td>—</Table.Td>
                      </Table.Tr>
                    ))}
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
export default ServerSettingsPage;
