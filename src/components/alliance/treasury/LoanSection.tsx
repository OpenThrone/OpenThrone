import {
  Badge,
  Button,
  Center,
  Group,
  Loader,
  NumberInput,
  Progress,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { allianceRequest } from '@/components/alliance/allianceStanding';
import { ApproveRequestButton } from '@/components/alliance/treasury/ApproveRequestButton';
import { GameCard } from '@/components/game/GameCard';
import { ALLIANCE_NOTE_MAX_LENGTH } from '@/constants/allianceTreasury';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import { toBigIntSafe } from '@/utils/jsonHelpers';
import { toLocale } from '@/utils/numberFormatting';

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'yellow',
  ACTIVE: 'blue',
  REPAID: 'green',
  DEFAULTED: 'red',
  WRITTEN_OFF: 'gray',
  DECLINED: 'red',
  CANCELLED: 'gray',
};

interface LoanSectionProps {
  allianceId: number;
  /** Refresh treasury balance and history after money moved. */
  onChanged: () => void;
  refreshKey: number;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('load failed');
  return res.json();
};

const owedLeft = (loan: any) =>
  toBigIntSafe(loan.amount_owed) - toBigIntSafe(loan.amount_repaid);

/** Treasury loans: request, repay and (for managers) decide. */
export const LoanSection = ({
  allianceId,
  onChanged,
  refreshKey,
}: LoanSectionProps) => {
  const { t } = useTranslation('allianceTreasury');
  const { user, forceUpdate } = useUser();
  const [amount, setAmount] = useState<bigint>(0n);
  const [reason, setReason] = useState('');
  const [repayAmount, setRepayAmount] = useState<bigint>(0n);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, mutate } = useSWR(
    [`/api/alliances/loans?allianceId=${allianceId}`, refreshKey],
    ([url]) => fetcher(url),
  );

  const run = async (key: string, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await task();
      await mutate();
      forceUpdate();
      onChanged();
    } catch (err: any) {
      alertService.error(err.message);
      await mutate();
    } finally {
      setBusy(null);
    }
  };

  const loans: any[] = data?.loans ?? [];
  const mine = loans.filter((l) => l.borrower_id === user?.id);
  const myOpen = mine.find((l) => ['ACTIVE', 'DEFAULTED'].includes(l.status));
  const myPending = mine.find((l) => l.status === 'REQUESTED');
  const live = loans.filter((l) =>
    ['REQUESTED', 'ACTIVE', 'DEFAULTED'].includes(l.status),
  );
  const history = loans.filter((l) => !live.includes(l));
  const terms = data?.terms;

  const submitRequest = () =>
    run('request', async () => {
      await allianceRequest('/api/alliances/loans/request', {
        allianceId,
        amount: amount.toString(),
        reason: reason.trim() || undefined,
      });
      alertService.success(t('loan.requestSuccess'));
      setAmount(0n);
      setReason('');
    });

  const submitRepay = (value: bigint) =>
    run('repay', async () => {
      const res = await fetch('/api/alliances/loans/repay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `alliance-loan-repay-${allianceId}-${value}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify({ allianceId, amount: value.toString() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Request failed');
      alertService.success(t('loan.repaySuccess'));
      setRepayAmount(0n);
    });

  const decide = (loanId: number, decision: 'approve' | 'decline') =>
    run(`${decision}-${loanId}`, async () => {
      await allianceRequest('/api/alliances/loans/decide', {
        allianceId,
        loanId,
        decision,
      });
      alertService.success(
        t(decision === 'approve' ? 'loan.approved' : 'loan.declined'),
      );
    });

  const cancel = (loanId: number) =>
    run(`cancel-${loanId}`, async () => {
      await allianceRequest('/api/alliances/loans/cancel', {
        allianceId,
        loanId,
      });
      alertService.success(t('loan.cancelled'));
    });

  if (error) {
    return (
      <GameCard title={t('loan.title')}>
        <Text c="red" role="alert">
          {t('loan.loadError')}
        </Text>
      </GameCard>
    );
  }
  if (!data) {
    return (
      <GameCard title={t('loan.title')}>
        <Center p="md">
          <Loader />
        </Center>
      </GameCard>
    );
  }

  const owed = myOpen ? toBigIntSafe(myOpen.amount_owed) : 0n;
  const repaid = myOpen ? toBigIntSafe(myOpen.amount_repaid) : 0n;
  const percent = owed > 0n ? Number((repaid * 100n) / owed) : 0;
  const left = myOpen ? owedLeft(myOpen) : 0n;
  const handGold = toBigIntSafe(user?.gold);
  const maxRepay = left < handGold ? left : handGold;

  return (
    <Stack gap="md">
      <GameCard title={t('loan.title')}>
        <Text size="sm" c="dimmed">
          {t('loan.terms', {
            days: terms.termDays,
            interest: terms.interestPct,
            cap: toLocale(terms.dailyCap),
          })}
        </Text>
        <Text size="sm" c="dimmed">
          {t('loan.incomeShare')}
        </Text>

        {myOpen ? (
          <Stack gap="xs" mt="md">
            <Group justify="space-between">
              <Text fw={600}>{t('loan.myLoan')}</Text>
              <Badge variant="light" color={STATUS_COLORS[myOpen.status]}>
                {t(`loan.status.${myOpen.status}`)}
              </Badge>
            </Group>
            <Progress
              value={percent}
              aria-label={t('loan.progress', { percent })}
            />
            <Text size="sm">
              {t('loan.progressText', {
                repaid: toLocale(repaid),
                owed: toLocale(owed),
                left: toLocale(left),
              })}
            </Text>
            {myOpen.due_at && (
              <Text
                size="sm"
                c={myOpen.status === 'DEFAULTED' ? 'red' : 'dimmed'}
              >
                {t('loan.due', {
                  date: new Date(myOpen.due_at).toLocaleString(),
                })}
              </Text>
            )}
            {myOpen.status === 'DEFAULTED' && (
              <Text size="sm" c="red" role="alert">
                {t('loan.defaultedNotice')}
              </Text>
            )}
            <Group align="flex-end" gap="xs">
              <NumberInput
                label={t('loan.repayAmount')}
                min={0}
                value={repayAmount.toString()}
                onChange={(val) => setRepayAmount(toBigIntSafe(val))}
                thousandSeparator=","
                style={{ flex: 1 }}
              />
              <Button
                variant="default"
                type="button"
                onClick={() => setRepayAmount(maxRepay)}
              >
                {t('max')}
              </Button>
              <Button
                type="button"
                loading={busy === 'repay'}
                disabled={repayAmount <= 0n || repayAmount > handGold}
                onClick={() => submitRepay(repayAmount)}
              >
                {t('loan.repayButton')}
              </Button>
            </Group>
          </Stack>
        ) : myPending ? (
          <Group mt="md" justify="space-between">
            <Text size="sm">
              {t('loan.pending', { amount: toLocale(myPending.principal) })}
            </Text>
            <Button
              size="compact-sm"
              variant="subtle"
              loading={busy === `cancel-${myPending.id}`}
              onClick={() => cancel(myPending.id)}
            >
              {t('cancel')}
            </Button>
          </Group>
        ) : data.canRequest ? (
          <Stack gap="xs" mt="md">
            <NumberInput
              label={t('amount')}
              description={t('loan.requestHint', {
                owed: toLocale(
                  amount + (amount * BigInt(terms.interestPct) + 99n) / 100n,
                ),
              })}
              min={0}
              value={amount.toString()}
              onChange={(val) => setAmount(toBigIntSafe(val))}
              thousandSeparator=","
              error={
                amount > toBigIntSafe(terms.dailyCap)
                  ? t('loan.overCap', { cap: toLocale(terms.dailyCap) })
                  : undefined
              }
            />
            <TextInput
              label={t('requestReason')}
              maxLength={ALLIANCE_NOTE_MAX_LENGTH}
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
            <Button
              type="button"
              loading={busy === 'request'}
              disabled={amount <= 0n || amount > toBigIntSafe(terms.dailyCap)}
              onClick={submitRequest}
            >
              {t('loan.requestButton')}
            </Button>
          </Stack>
        ) : (
          <Text mt="md" size="sm" c="dimmed">
            {t('loan.noPermission')}
          </Text>
        )}
      </GameCard>

      {data.canManage && (
        <GameCard title={t('loan.queueTitle')}>
          {live.length === 0 ? (
            <Text c="dimmed">{t('loan.queueEmpty')}</Text>
          ) : (
            <Table.ScrollContainer minWidth={560}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('queueMember')}</Table.Th>
                    <Table.Th>{t('loan.principal')}</Table.Th>
                    <Table.Th>{t('loan.balance')}</Table.Th>
                    <Table.Th>{t('queueStatus')}</Table.Th>
                    <Table.Th>{t('queueActions')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {live.map((loan) => (
                    <Table.Tr key={loan.id}>
                      <Table.Td>{loan.borrower?.display_name}</Table.Td>
                      <Table.Td>{toLocale(loan.principal)}</Table.Td>
                      <Table.Td>
                        {loan.status === 'REQUESTED'
                          ? '-'
                          : `${toLocale(owedLeft(loan))} / ${toLocale(loan.amount_owed)}`}
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          color={STATUS_COLORS[loan.status]}
                        >
                          {t(`loan.status.${loan.status}`)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {loan.status === 'REQUESTED' && (
                          <Group gap="xs" wrap="nowrap">
                            <ApproveRequestButton
                              blockedAsOwn={
                                loan.borrower_id === user?.id &&
                                !data.canApproveOwn
                              }
                              loading={busy === `approve-${loan.id}`}
                              onApprove={() => decide(loan.id, 'approve')}
                            />
                            <Button
                              size="compact-xs"
                              color="red"
                              variant="light"
                              disabled={busy !== null}
                              onClick={() => decide(loan.id, 'decline')}
                            >
                              {t('decline')}
                            </Button>
                          </Group>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          {history.length > 0 && (
            <Text size="xs" c="dimmed" mt="sm">
              {t('loan.closedCount', { count: history.length })}
            </Text>
          )}
        </GameCard>
      )}
    </Stack>
  );
};
