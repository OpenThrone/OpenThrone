import { Button, SimpleGrid, Space, Table } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';

import QuantityInput from '@/components/battle/QuantityInput';
import { EmptyState } from '@/components/game/EmptyState';
import { PageLoading } from '@/components/game/PageLoading';
import { alertService } from '@/services/Alert.service';
import type { Locales } from '@/types/typings';
import { DEPOSIT_CAP_PERCENT, getMaxDeposit } from '@/utils/bankLimits';
import { toBigIntSafe } from '@/utils/jsonHelpers';
import { logError } from '@/utils/logger';
import { toLocale } from '@/utils/numberFormatting';

import {
  formatTransactionGold,
  translateTransactionType,
} from './BankHistoryTable';
import { GameCard } from './game/GameCard';
import { StyledTable } from './game/StyledTable';

/** Server refusals shown to the player in their language. */
const SERVER_ERROR_KEYS: Record<string, string> = {
  'Maximum deposits reached': 'bank.noDepositsLeft',
  'Not enough gold for withdrawal': 'bank.withdrawOverBalance',
};

/** Bank deposit withdraw. */
export default function BankDepositWithdraw({ user, forceUpdate }) {
  const [depositAmount, setDepositAmount] = useState(BigInt(0));
  const [withdrawAmount, setWithdrawAmount] = useState(BigInt(0));
  const [history, setHistory] = useState<any[] | null>(null);
  const [pending, setPending] = useState<'deposit' | 'withdraw' | null>(null);
  const { t, i18n } = useTranslation('structures');
  const locale = i18n.language;
  const maxDeposit = getMaxDeposit(toBigIntSafe(user?.gold));
  // UserModel exposes the balance as goldInBank; gold_in_bank is the raw column.
  const bankBalance = toBigIntSafe(user?.goldInBank ?? user?.gold_in_bank);
  useEffect(() => {
    if (user) {
      fetch('/api/bank/history?deposits=true&withdraws=true&limit=10&page=0')
        .then((res) => res.json())
        .then((data) => setHistory(Array.isArray(data?.rows) ? data.rows : []))
        .catch((err) => {
          logError('Error fetching bank history:', err);
          setHistory([]);
        });
    }
  }, [user]);

  const handleTransaction = async (
    type: 'deposit' | 'withdraw',
    amount: bigint,
  ) => {
    if (amount <= 0 || pending) return;
    if (type === 'deposit' && amount > maxDeposit) return;
    if (type === 'withdraw' && amount > bankBalance) return;
    setPending(type);
    try {
      const response = await fetch(`/api/bank/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `bank-${type}-${amount}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify({ amount: amount.toString() }),
      });
      const data = await response.json();
      if (data.error)
        throw new Error(
          SERVER_ERROR_KEYS[data.error]
            ? t(SERVER_ERROR_KEYS[data.error])
            : data.error,
        );
      alertService.success(
        t(type === 'deposit' ? 'bank.depositSuccess' : 'bank.withdrawSuccess'),
      );
      forceUpdate();
      if (type === 'deposit') setDepositAmount(BigInt(0));
      else setWithdrawAmount(BigInt(0));
    } catch (error) {
      alertService.error((error as Error).message);
    } finally {
      setPending(null);
    }
  };

  const historyRows = (history ?? []).map((entry, index) => (
    <Table.Tr key={index}>
      <Table.Td>{new Date(entry?.date_time).toLocaleString(locale)}</Table.Td>
      <Table.Td>{translateTransactionType(entry, t)}</Table.Td>
      <Table.Td>{formatTransactionGold(entry, user, t, locale)}</Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <GameCard title={t('bank.deposit')}>
          <QuantityInput
            label={t('bank.amount')}
            description={t('bank.depositHint', {
              percent: DEPOSIT_CAP_PERCENT,
            })}
            value={depositAmount}
            onChange={setDepositAmount}
            grow
            onMax={() => setDepositAmount(maxDeposit)}
            maxAriaLabel={t('bank.depositMaxAria')}
            error={
              depositAmount > maxDeposit
                ? t('bank.depositOverCap', { percent: DEPOSIT_CAP_PERCENT })
                : undefined
            }
          />
          <Button
            mt="md"
            loading={pending === 'deposit'}
            disabled={depositAmount <= 0 || depositAmount > maxDeposit}
            onClick={() => handleTransaction('deposit', depositAmount)}
          >
            {t('bank.deposit')}
          </Button>
        </GameCard>
        <GameCard title={t('bank.withdraw')}>
          <QuantityInput
            label={t('bank.amount')}
            description={t('bank.withdrawHint', {
              amount: toLocale(bankBalance, locale as Locales),
            })}
            value={withdrawAmount}
            onChange={setWithdrawAmount}
            grow
            onMax={() => setWithdrawAmount(bankBalance)}
            maxAriaLabel={t('bank.withdrawMaxAria')}
            error={
              withdrawAmount > bankBalance
                ? t('bank.withdrawOverBalance')
                : undefined
            }
          />
          <Button
            mt="md"
            loading={pending === 'withdraw'}
            disabled={withdrawAmount <= 0 || withdrawAmount > bankBalance}
            onClick={() => handleTransaction('withdraw', withdrawAmount)}
          >
            {t('bank.withdraw')}
          </Button>
        </GameCard>
      </SimpleGrid>
      <Space h="md" />
      <GameCard title={t('bank.recentTransactions')}>
        {history === null ? (
          <PageLoading block={false} />
        ) : history.length === 0 ? (
          <EmptyState compact title={t('bank.noRecords')} />
        ) : (
          <StyledTable
            headers={[t('bank.date'), t('bank.type'), t('bank.amount')]}
          >
            {historyRows}
          </StyledTable>
        )}
      </GameCard>
    </>
  );
}
