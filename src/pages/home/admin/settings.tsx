import {
  Accordion,
  Button,
  Code,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  RECRUIT_CAPTCHA_PROVIDERS,
  RUNTIME_SETTING_GROUPS,
  RUNTIME_SETTING_KEYS,
  RUNTIME_SETTING_REGISTRY,
  type RuntimeSettingKey,
} from '@/constants/runtimeSettings';
import { alertService } from '@/services/Alert.service';
import { serverSideTranslations } from '@/utils/serverTranslations';

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
  // Live values for every setting, env defaults included.
  const [effective, setEffective] = useState<Record<string, unknown>>({});
  const [numericDrafts, setNumericDrafts] = useState<
    Record<string, number | string>
  >({});
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rangeDraft, setRangeDraft] = useState(5);
  const [emailRateDraft, setEmailRateDraft] = useState(60);
  const [protectionDaysDraft, setProtectionDaysDraft] = useState(14);
  const [recruitCapDraft, setRecruitCapDraft] = useState(25);
  const [internalRecruitCapDraft, setInternalRecruitCapDraft] = useState(250);
  const [externalIpRecruitCapDraft, setExternalIpRecruitCapDraft] = useState(5);
  const [maintenanceDraft, setMaintenanceDraft] = useState({
    enabled: false,
    message: '',
  });
  const [staminaDraft, setStaminaDraft] = useState({
    'stamina.penaltyThreshold': 50,
    'stamina.minOffensePercent': 80,
    'stamina.enabled': true,
    'stamina.recoveryEnabled': true,
    'stamina.recoveryAmount': 5,
    'stamina.recoveryIntervalMinutes': 10,
    'stamina.baseCost': 2,
    'stamina.perTurnCost': 0.5,
  });

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [response, effectiveResponse] = await Promise.all([
        fetch('/api/admin/system/server-settings'),
        fetch('/api/admin/system/server-settings?effective=1'),
      ]);
      if (!response.ok || !effectiveResponse.ok) throw new Error('load');
      const nextRows: SettingRow[] = await response.json();
      const nextEffective: Record<string, unknown> =
        await effectiveResponse.json();
      const liveValue = (key: string) =>
        nextRows.find((row) => row.key === key)?.value ?? nextEffective[key];
      setRows(nextRows);
      setEffective(nextEffective);
      // Inputs show the stored value again after a save, revert or refusal.
      setNumericDrafts({});
      const number = (key: string, fallback: number) => {
        const value = liveValue(key);
        return typeof value === 'number' ? value : fallback;
      };
      setRangeDraft(number('ATTACK_LEVEL_RANGE', 5));
      setProtectionDaysDraft(number('era.protectionDurationDays', 14));
      setRecruitCapDraft(number('recruit.dailyCap', 25));
      setInternalRecruitCapDraft(number('recruit.internalDailyCap', 250));
      setExternalIpRecruitCapDraft(number('recruit.externalIpDailyCap', 5));
      setEmailRateDraft(number('email.outbox.ratePerMinute', 60));
      const maintenance = liveValue('MAINTENANCE_MODE') as
        | { enabled?: boolean; message?: string }
        | undefined;
      setMaintenanceDraft({
        enabled: maintenance?.enabled === true,
        message: maintenance?.message ?? '',
      });
      setStaminaDraft((current) => {
        const next = { ...current };
        for (const key of Object.keys(current) as (keyof typeof current)[]) {
          const value =
            liveValue(key) ?? RUNTIME_SETTING_REGISTRY[key].fallback;
          if (typeof value === 'boolean' || typeof value === 'number') {
            next[key] = value as never;
          }
        }
        return next;
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
    // A no-op must not restart every player's recovery interval.
    if (
      key.startsWith('stamina.') &&
      rows.some((row) => row.key === key && Object.is(row.value, value))
    )
      return;
    setSavingKey(key);
    try {
      const response = await fetch('/api/admin/system/server-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (!response.ok) throw new Error('save');
      alertService.notify('success', t('settings.saved'), {
        title: t('saved'),
      });
      await fetchSettings();
    } catch {
      alertService.notify('error', t('settings.saveError'), {
        title: t('error'),
      });
      setNumericDrafts(({ [key]: _refused, ...rest }) => rest);
      if (key.startsWith('stamina.')) await fetchSettings();
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
      alertService.notify('success', t('settings.reverted'), {
        title: t('saved'),
      });
      await fetchSettings();
    } catch {
      alertService.notify('error', t('settings.revertError'), {
        title: t('error'),
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
      alertService.notify('error', t('settings.historyError'), {
        title: t('error'),
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
          <Accordion multiple defaultValue={[RUNTIME_SETTING_GROUPS[0]]}>
            {RUNTIME_SETTING_GROUPS.map((group) => (
              <Accordion.Item value={group} key={group}>
                <Accordion.Control>
                  <Group gap="sm" wrap="nowrap">
                    <Text fw={700} size="md" c="var(--ot-heading)">
                      {t(`settings.groups.${group}`)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t('settings.groupCount', {
                        count: RUNTIME_SETTING_KEYS.filter(
                          (key) =>
                            RUNTIME_SETTING_REGISTRY[key].group === group,
                        ).length,
                      })}
                    </Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  {group === 'stamina' && (
                    <Text size="sm" c="dimmed" mb="sm">
                      {t('settings.staminaHelp')}
                    </Text>
                  )}
                  <AdminDataTable
                    size="compact"
                    layout="fixed"
                    ariaLabel={t(`settings.groups.${group}`)}
                    verticalSpacing="sm"
                  >
                    {/* Same column widths in every group so values line up down the page. */}
                    <colgroup>
                      <col style={{ width: '38%' }} />
                      <col style={{ width: '26%' }} />
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '12%' }} />
                    </colgroup>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t('key')}</Table.Th>
                        <Table.Th>{t('value')}</Table.Th>
                        <Table.Th>{t('status')}</Table.Th>
                        <Table.Th>{t('actions')}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {RUNTIME_SETTING_KEYS.filter(
                        (key) => RUNTIME_SETTING_REGISTRY[key].group === group,
                      ).map((key) => {
                        const meta = RUNTIME_SETTING_REGISTRY[key];
                        const row = byKey.get(key);
                        const value =
                          row?.value ?? effective[key] ?? meta.fallback;
                        const staminaKey = key as keyof typeof staminaDraft;
                        const isStaminaSetting = staminaKey in staminaDraft;
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
                              <Text fw={600}>
                                {t(`settings.labels.${key}`)}
                              </Text>
                              <Code>{key}</Code>
                            </Table.Td>
                            <Table.Td>
                              {isStaminaSetting &&
                              typeof staminaDraft[staminaKey] === 'boolean' ? (
                                <Switch
                                  aria-label={t(`settings.labels.${key}`)}
                                  checked={Boolean(staminaDraft[staminaKey])}
                                  disabled={savingKey === key}
                                  onChange={(event) => {
                                    const nextValue =
                                      event.currentTarget.checked;
                                    setStaminaDraft((current) => ({
                                      ...current,
                                      [staminaKey]: nextValue,
                                    }));
                                    save(key, nextValue);
                                  }}
                                />
                              ) : isStaminaSetting ? (
                                <NumberInput
                                  aria-label={t(`settings.labels.${key}`)}
                                  min={
                                    key === 'stamina.recoveryIntervalMinutes'
                                      ? 1
                                      : key === 'stamina.minOffensePercent'
                                        ? 50
                                        : 0
                                  }
                                  max={
                                    key === 'stamina.recoveryIntervalMinutes'
                                      ? 1440
                                      : key === 'stamina.perTurnCost' ||
                                          key === 'stamina.penaltyThreshold' ||
                                          key === 'stamina.minOffensePercent'
                                        ? 100
                                        : 1000
                                  }
                                  allowDecimal={key === 'stamina.perTurnCost'}
                                  decimalScale={2}
                                  value={staminaDraft[staminaKey] as number}
                                  disabled={savingKey === key}
                                  onChange={(next) => {
                                    if (typeof next === 'number') {
                                      setStaminaDraft((current) => ({
                                        ...current,
                                        [staminaKey]: next,
                                      }));
                                    }
                                  }}
                                  onBlur={(event) => {
                                    const inputValue = Number(
                                      event.currentTarget.value,
                                    );
                                    const minimum =
                                      key === 'stamina.recoveryIntervalMinutes'
                                        ? 1
                                        : key === 'stamina.minOffensePercent'
                                          ? 50
                                          : 0;
                                    const maximum =
                                      key === 'stamina.recoveryIntervalMinutes'
                                        ? 1440
                                        : key === 'stamina.perTurnCost' ||
                                            key ===
                                              'stamina.penaltyThreshold' ||
                                            key === 'stamina.minOffensePercent'
                                          ? 100
                                          : 1000;
                                    const bounded = Math.min(
                                      maximum,
                                      Math.max(
                                        minimum,
                                        Number.isFinite(inputValue)
                                          ? inputValue
                                          : Number(value),
                                      ),
                                    );
                                    const next =
                                      key === 'stamina.perTurnCost'
                                        ? Math.round(bounded * 100) / 100
                                        : Math.round(bounded);
                                    setStaminaDraft((current) => ({
                                      ...current,
                                      [staminaKey]: next,
                                    }));
                                    save(key, next);
                                  }}
                                />
                              ) : key === 'ATTACK_LEVEL_RANGE' ? (
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
                              ) : key === 'recruit.dailyCap' ? (
                                <NumberInput
                                  aria-label={t(`settings.labels.${key}`)}
                                  min={0}
                                  max={1000}
                                  allowDecimal={false}
                                  value={recruitCapDraft}
                                  disabled={savingKey === key}
                                  onChange={(next) => {
                                    if (typeof next === 'number')
                                      setRecruitCapDraft(next);
                                  }}
                                  onBlur={() => save(key, recruitCapDraft)}
                                />
                              ) : key === 'recruit.internalDailyCap' ? (
                                <NumberInput
                                  aria-label={t(`settings.labels.${key}`)}
                                  min={0}
                                  max={1000}
                                  allowDecimal={false}
                                  value={internalRecruitCapDraft}
                                  disabled={savingKey === key}
                                  onChange={(next) => {
                                    if (typeof next === 'number')
                                      setInternalRecruitCapDraft(next);
                                  }}
                                  onBlur={() =>
                                    save(key, internalRecruitCapDraft)
                                  }
                                />
                              ) : key === 'recruit.externalIpDailyCap' ? (
                                <NumberInput
                                  aria-label={t(`settings.labels.${key}`)}
                                  min={0}
                                  max={1000}
                                  allowDecimal={false}
                                  value={externalIpRecruitCapDraft}
                                  disabled={savingKey === key}
                                  onChange={(next) => {
                                    if (typeof next === 'number')
                                      setExternalIpRecruitCapDraft(next);
                                  }}
                                  onBlur={() =>
                                    save(key, externalIpRecruitCapDraft)
                                  }
                                />
                              ) : key === 'recruit.captchaProvider' ? (
                                <Select
                                  aria-label={t(`settings.labels.${key}`)}
                                  allowDeselect={false}
                                  data={RECRUIT_CAPTCHA_PROVIDERS.map(
                                    (provider) => ({
                                      value: provider,
                                      label: t(
                                        `settings.captchaProviders.${provider}`,
                                      ),
                                    }),
                                  )}
                                  value={
                                    typeof value === 'string' ? value : null
                                  }
                                  disabled={savingKey === key}
                                  onChange={(next) => {
                                    if (next) save(key, next);
                                  }}
                                />
                              ) : meta.type === 'NUMBER' ? (
                                <NumberInput
                                  aria-label={t(`settings.labels.${key}`)}
                                  value={
                                    numericDrafts[key] ??
                                    (typeof value === 'number' ? value : 0)
                                  }
                                  disabled={savingKey === key}
                                  onChange={(next) =>
                                    setNumericDrafts((current) => ({
                                      ...current,
                                      [key]: next,
                                    }))
                                  }
                                  onBlur={() => {
                                    const next = numericDrafts[key];
                                    if (typeof next === 'number')
                                      save(key, next);
                                  }}
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
                                  : meta.env
                                    ? t('settings.environmentDefault')
                                    : t('settings.builtInDefault')}
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
                                  variant="default"
                                  onClick={() =>
                                    revert(key, history[key][0].id)
                                  }
                                >
                                  {t('settings.revertLatest')}
                                </Button>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                      {group === 'features' &&
                        rows
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
                              <Table.Td>
                                {t('settings.unknownReadOnly')}
                              </Table.Td>
                              <Table.Td>—</Table.Td>
                            </Table.Tr>
                          ))}
                    </Table.Tbody>
                  </AdminDataTable>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
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
