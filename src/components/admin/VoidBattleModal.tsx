import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Radio,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useRef, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import type {
  VoidGoldMode,
  VoidItem,
  VoidPlan,
} from '@/services/BattleVoid.service';
import { logError } from '@/utils/logger';

const STATUS_COLOR = {
  reverse: 'green',
  capped: 'yellow',
  not_reversed: 'gray',
} as const;

/** The pieces of the plan the dialog needs; server-only code stays out of the bundle. */
export type VoidPlanView = Pick<
  VoidPlan,
  'logId' | 'attackerName' | 'defenderName' | 'goldMode' | 'hash'
> & { items: VoidItem[] };

interface VoidBattleModalProps {
  opened: boolean;
  attackLogId: number;
  onClose: () => void;
  /** Called after a successful void so the caller can reload the battle. */
  onVoided: () => void;
  /** Test and guide hook: replaces the network calls. */
  request?: (body: Record<string, unknown>) => Promise<Response>;
}

const formatAmount = (value: string, locale: string) => {
  try {
    return BigInt(value).toLocaleString(locale);
  } catch {
    return value;
  }
};

/**
 * Admin dialog for voiding a battle with compensation (#229):
 * preview what would be reversed, give a reason, then confirm.
 */
export default function VoidBattleModal({
  opened,
  attackLogId,
  onClose,
  onVoided,
  request,
}: VoidBattleModalProps) {
  const { t, i18n } = useTranslation('battle');
  const [goldMode, setGoldMode] = useState<VoidGoldMode>('full');
  const [reason, setReason] = useState('');
  const [plan, setPlan] = useState<VoidPlanView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const pendingRef = useRef(false);
  const send =
    request ??
    ((body: Record<string, unknown>) =>
      fetch('/api/admin/attacks/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));

  const call = async (body: Record<string, unknown>) => {
    if (pendingRef.current) return null;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await send(body);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = typeof data.code === 'string' ? data.code : 'generic';
        setError(
          t(`void.errors.${code}`, { defaultValue: t('void.errors.generic') }),
        );
        if (code === 'STALE_PLAN') setPlan(null);
        return null;
      }
      return data;
    } catch (cause) {
      logError('Battle void request failed', cause);
      setError(t('void.errors.generic'));
      return null;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const runPreview = async () => {
    const data = await call({ action: 'preview', attackLogId, goldMode });
    if (data?.plan) setPlan(data.plan);
  };

  const confirmVoid = async () => {
    if (!plan) return;
    if (!reason.trim()) {
      setError(t('void.reasonRequired'));
      return;
    }
    const data = await call({
      action: 'confirm',
      attackLogId,
      goldMode: plan.goldMode,
      reason: reason.trim(),
      planHash: plan.hash,
    });
    if (data?.voided) {
      setDone(true);
      onVoided();
    }
  };

  const capped = plan?.items.filter((item) => item.status === 'capped') ?? [];
  const skipped =
    plan?.items.filter((item) => item.status === 'not_reversed') ?? [];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('void.title', { id: attackLogId })}
      size="min(68rem, 96vw)"
    >
      <Stack>
        {done ? (
          <>
            <Alert color="green" role="status">
              {t('void.done', { id: attackLogId })}
            </Alert>
            <Group justify="flex-end">
              <Button onClick={onClose}>{t('void.close')}</Button>
            </Group>
          </>
        ) : (
          <>
            <Text size="sm">{t('void.intro')}</Text>
            {!plan && (
              <Radio.Group
                label={t('void.goldModeLabel')}
                value={goldMode}
                onChange={(value) => setGoldMode(value as VoidGoldMode)}
              >
                <Stack gap="xs" mt="xs">
                  <Radio value="full" label={t('void.goldModeFull')} />
                  <Radio
                    value="recovered"
                    label={t('void.goldModeRecovered')}
                  />
                </Stack>
              </Radio.Group>
            )}
            {plan && (
              <>
                <Text fw={600}>
                  {t('void.summaryTitle', {
                    attacker: plan.attackerName,
                    defender: plan.defenderName,
                  })}
                </Text>
                <AdminDataTable
                  size="default"
                  ariaLabel={t('void.title', { id: attackLogId })}
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('void.columns.effect')}</Table.Th>
                      <Table.Th>{t('void.columns.side')}</Table.Th>
                      <Table.Th ta="right">
                        {t('void.columns.recorded')}
                      </Table.Th>
                      <Table.Th ta="right">
                        {t('void.columns.applied')}
                      </Table.Th>
                      <Table.Th>{t('void.columns.status')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {plan.items.map((item, index) => (
                      <Table.Tr key={`${item.kind}-${index}`}>
                        <Table.Td>
                          <Text size="sm">
                            {t(`void.items.${item.kind}`, item.vars)}
                          </Text>
                          {item.note && (
                            <Text size="xs" c="dimmed">
                              {t(`void.notes.${item.note}`)}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>{t(`void.sides.${item.side}`)}</Table.Td>
                        <Table.Td ta="right">
                          {formatAmount(item.recorded, i18n.language)}
                        </Table.Td>
                        <Table.Td ta="right">
                          {formatAmount(item.applied, i18n.language)}
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: 'nowrap' }}>
                          <Badge
                            variant="light"
                            color={STATUS_COLOR[item.status]}
                            styles={{
                              root: { overflow: 'visible' },
                              label: {
                                overflow: 'visible',
                                textOverflow: 'clip',
                              },
                            }}
                          >
                            {t(`void.status.${item.status}`)}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </AdminDataTable>
                {capped.length > 0 && (
                  <Alert color="yellow" role="status">
                    {t('void.shortfallTitle', { count: capped.length })}
                  </Alert>
                )}
                {skipped.length > 0 && (
                  <Alert color="gray" role="status">
                    {t('void.notReversedTitle', { count: skipped.length })}
                  </Alert>
                )}
                <Textarea
                  label={t('void.reasonLabel')}
                  placeholder={t('void.reasonPlaceholder')}
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                  maxLength={500}
                  minRows={2}
                  autosize
                  required
                  data-autofocus
                />
              </>
            )}
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            <Group justify="flex-end">
              {plan && (
                <Button
                  variant="default"
                  onClick={() => setPlan(null)}
                  disabled={pending}
                >
                  {t('void.back')}
                </Button>
              )}
              {plan ? (
                <Button
                  color="red"
                  onClick={confirmVoid}
                  loading={pending}
                  disabled={!reason.trim()}
                >
                  {pending ? t('void.confirming') : t('void.confirm')}
                </Button>
              ) : (
                <Button onClick={runPreview} loading={pending}>
                  {pending ? t('void.previewing') : t('void.preview')}
                </Button>
              )}
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
