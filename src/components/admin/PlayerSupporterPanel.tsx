import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { StripePaymentLink } from '@/components/admin/supporters/SupporterAdminParts';
import { GameCard } from '@/components/game/GameCard';
import { date, money } from '@/components/supporter/SupporterParts';
import type {
  AdminPlayerSupporter,
  AdminSupporterAction,
  PaymentRecord,
} from '@/types/supporter';

type Props = {
  userId: number;
  initialData?: AdminPlayerSupporter;
  onAction?: (action: AdminSupporterAction) => void;
};
export default function PlayerSupporterPanel({
  userId,
  initialData,
  onAction,
}: Props) {
  const { t } = useTranslation('admin-supporters');
  const [data, setData] = useState<AdminPlayerSupporter | null>(
    initialData ?? null,
  );
  const [testMode, setTestMode] = useState(true);
  useEffect(() => {
    fetch('/api/admin/supporters/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((summary) => {
        if (summary) setTestMode(summary.testMode ?? true);
      })
      .catch(() => {});
  }, []);
  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<string | number>(30);
  const [reason, setReason] = useState('');
  const [modal, setModal] = useState<
    'revoke' | 'refund' | 'unlinkDiscord' | null
  >(null);
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [amount, setAmount] = useState<string | number>('');
  const [cancelSubscription, setCancelSubscription] = useState(false);
  const load = useCallback(async () => {
    if (initialData) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/supporter`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || t('loadError'));
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [initialData, t, userId]);
  useEffect(() => {
    load();
  }, [load]);
  const act = async (action: AdminSupporterAction) => {
    if (saving) return;
    if (onAction) {
      onAction(action);
      setModal(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/supporter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || t('actionError'));
      setModal(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setSaving(false);
    }
  };
  if (loading && !data) return <Loader aria-label={t('loading')} />;
  if (!data)
    return (
      <Alert color="red" role="alert">
        {error ?? t('loadError')}
        <Button onClick={load}>{t('retry')}</Button>
      </Alert>
    );
  const remaining = payment ? payment.amountCents - payment.refundedCents : 0;
  const refundCents =
    amount === '' ? undefined : Math.round(Number(amount) * 100);
  return (
    <Stack>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <GameCard title={t('membership')}>
        <Stack gap="xs">
          <Text>
            {t('status')}:{' '}
            {data.status.status ? t(`labels.${data.status.status}`) : '—'}
          </Text>
          <Text>
            {t('activeUntil')}: {date(data.status.activeUntil)}
          </Text>
          <Text>
            {t('source')}:{' '}
            {data.status.source ? t(`labels.${data.status.source}`) : '—'}
          </Text>
          <Text>
            {t('cancelAtEnd')}:{' '}
            {t(data.status.cancelAtPeriodEnd ? 'yes' : 'no')}
          </Text>
          <Text>
            {t('customerId')}: {data.membership?.providerCustomerId ?? '—'}
          </Text>
          <Text>
            {t('subscriptionId')}:{' '}
            {data.membership?.providerSubscriptionId ?? '—'}
          </Text>
          <Switch
            label={t('badgeVisible')}
            checked={data.status.badgeVisible}
            disabled={saving}
            onChange={(e) =>
              act({
                action: 'setBadgeVisible',
                badgeVisible: e.currentTarget.checked,
              })
            }
          />
        </Stack>
      </GameCard>
      <GameCard title={t('comp')}>
        <Stack>
          <NumberInput
            label={t('days')}
            value={days}
            onChange={setDays}
            min={1}
            allowDecimal={false}
            required
          />
          <Textarea
            label={t('reason')}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            required
          />
          <Group>
            <Button
              loading={saving}
              disabled={
                !reason.trim() ||
                !Number.isInteger(Number(days)) ||
                Number(days) < 1
              }
              onClick={() =>
                act({
                  action: 'comp',
                  days: Number(days),
                  reason: reason.trim(),
                })
              }
            >
              {t('comp')}
            </Button>
            <Button
              color="red"
              disabled={saving}
              onClick={() => {
                setReason('');
                setModal('revoke');
              }}
            >
              {t('revoke')}
            </Button>
          </Group>
        </Stack>
      </GameCard>
      <GameCard title={t('discord.title')}>
        {data.discord ? (
          <Stack gap="xs">
            <Text>
              {t('discord.account')}: {data.discord.discordUsername} (
              {data.discord.discordUserId})
            </Text>
            <Text>
              {t('discord.linkedAt')}: {date(data.discord.linkedAt)}
            </Text>
            <Text>
              {t('discord.alerts')}:{' '}
              {(
                [
                  'dailyDigest',
                  'attacks',
                  'spyHits',
                  'wars',
                  'turnCap',
                ] as const
              )
                .filter((key) => data.discord?.notifyPrefs[key])
                .map((key) => t(`discord.prefs.${key}`))
                .join(', ') || '—'}
            </Text>
            <Text>
              {t('discord.outbox')}:{' '}
              {Object.entries(data.discord.outbox)
                .map(([status, count]) => `${status} ${count}`)
                .join(', ') || '—'}
            </Text>
            <Button
              color="red"
              w="fit-content"
              disabled={saving}
              onClick={() => {
                setReason('');
                setModal('unlinkDiscord');
              }}
            >
              {t('discord.unlink')}
            </Button>
          </Stack>
        ) : (
          <Text>{t('discord.notLinked')}</Text>
        )}
      </GameCard>
      <GameCard title={t('payments')}>
        <AdminDataTable ariaLabel={t('payments')}>
          <Table.Thead>
            <Table.Tr>
              {['date', 'description', 'amount', 'status', 'actions'].map(
                (k) => (
                  <Table.Th key={k}>{t(k)}</Table.Th>
                ),
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.payments.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>{date(p.createdAt)}</Table.Td>
                <Table.Td>
                  {t(`labels.${p.description}`, {
                    defaultValue: t(`labels.${p.kind}`),
                  })}
                  <StripePaymentLink payment={p} testMode={testMode} />
                </Table.Td>
                <Table.Td>
                  {money(p.amountCents, p.currency)}{' '}
                  {p.billingCountry && (
                    <Badge
                      color={p.billingCountry === 'US' ? 'gray' : 'red'}
                      title={t('billingCountry')}
                    >
                      {p.billingCountry === 'US'
                        ? p.billingCountry
                        : t('nonUs', { country: p.billingCountry })}
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{t(`labels.${p.status}`)}</Table.Td>
                <Table.Td>
                  {['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status) && (
                    <Button
                      size="xs"
                      disabled={saving}
                      onClick={() => {
                        setPayment(p);
                        setAmount('');
                        setReason('');
                        setCancelSubscription(false);
                        setModal('refund');
                      }}
                    >
                      {t('refund')}
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </AdminDataTable>
        {!data.payments.length && <Text>{t('empty')}</Text>}
      </GameCard>
      <GameCard title={t('consents')}>
        <Stack gap="xs">
          {(data.consents ?? []).map((c) => (
            <Stack key={c.id} gap={2}>
              <Text fw={700}>
                {date(c.acceptedAt)} ·{' '}
                {t(`labels.${c.planId}`, { defaultValue: c.planId })} ·{' '}
                {money(c.amountCents)} · {c.locale} · v{c.version}
              </Text>
              <Text size="sm">{c.text}</Text>
            </Stack>
          ))}
          {!data.consents?.length && <Text>{t('empty')}</Text>}
        </Stack>
      </GameCard>
      <GameCard title={t('gifts')}>
        <AdminDataTable ariaLabel={t('gifts')}>
          <Table.Thead>
            <Table.Tr>
              {['code', 'months', 'status', 'recipient'].map((k) => (
                <Table.Th key={k}>{t(k)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.gifts.map((g) => (
              <Table.Tr key={g.id}>
                <Table.Td>{g.codePrefix}</Table.Td>
                <Table.Td>{g.months}</Table.Td>
                <Table.Td>{t(`labels.${g.status}`)}</Table.Td>
                <Table.Td>
                  {g.redeemedByName ?? g.recipientName ?? '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </AdminDataTable>
        {!data.gifts.length && <Text>{t('empty')}</Text>}
      </GameCard>
      <Modal
        opened={modal !== null}
        onClose={() => {
          if (!saving) setModal(null);
        }}
        title={t(
          modal === 'unlinkDiscord' ? 'discord.unlink' : (modal ?? 'revoke'),
        )}
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
      >
        <Stack>
          <Text>
            {t(
              modal === 'refund'
                ? 'confirmRefund'
                : modal === 'unlinkDiscord'
                  ? 'discord.confirmUnlink'
                  : 'confirmRevoke',
            )}
          </Text>
          {modal === 'refund' && payment && (
            <NumberInput
              label={t('refundAmount')}
              description={t('refundHint', {
                amount: money(remaining, payment.currency),
              })}
              min={0.01}
              max={remaining / 100}
              decimalScale={2}
              value={amount}
              onChange={setAmount}
            />
          )}
          {modal === 'refund' && payment?.kind === 'SUBSCRIPTION' && (
            <Checkbox
              label={t('cancelSubscription')}
              description={t('cancelSubscriptionHint')}
              checked={cancelSubscription}
              onChange={(e) => setCancelSubscription(e.currentTarget.checked)}
            />
          )}
          <Textarea
            label={t('reason')}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            required
          />
          <Button
            color="red"
            loading={saving}
            disabled={
              !reason.trim() ||
              (modal === 'refund' &&
                refundCents !== undefined &&
                (!Number.isFinite(refundCents) ||
                  refundCents <= 0 ||
                  refundCents > remaining))
            }
            onClick={() => {
              if (modal === 'revoke')
                act({ action: 'revoke', reason: reason.trim() });
              else if (modal === 'unlinkDiscord')
                act({ action: 'unlinkDiscord', reason: reason.trim() });
              else if (payment)
                act({
                  action: 'refund',
                  paymentId: payment.id,
                  ...(refundCents === undefined
                    ? {}
                    : { amountCents: refundCents }),
                  ...(cancelSubscription ? { cancelSubscription: true } : {}),
                  reason: reason.trim(),
                });
            }}
          >
            {t('confirm')}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
