import { Button, NumberInput, SimpleGrid, Space, Table } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';

import { alertService } from '@/services/Alert.service';
import { DEPOSIT_CAP_PERCENT, getMaxDeposit } from '@/utils/bankLimits';
import { toBigIntSafe } from '@/utils/jsonHelpers';
import { logError } from '@/utils/logger';
import { toLocale } from '@/utils/numberFormatting';
import { getGoldTxSymbol, getTransactionType } from '@/utils/utilities';

import { GameCard } from './game/GameCard';
import { StyledTable } from './game/StyledTable';

/** Bank deposit withdraw. */
export default function BankDepositWithdraw({ user, forceUpdate }) {
  const [depositAmount, setDepositAmount] = useState(BigInt(0));
  const [withdrawAmount, setWithdrawAmount] = useState(BigInt(0));
  const [history, setHistory] = useState([]);
  const { t } = useTranslation('structures');
  const maxDeposit = getMaxDeposit(toBigIntSafe(user?.gold));
  const bankBalance = toBigIntSafe(user?.gold_in_bank);
  useEffect(() => {
    if (user) {
      fetch('/api/bank/history?deposits=true&withdraws=true&limit=10&page=0')
        .then((res) => res.json())
        .then((data) => setHistory(data.rows))
        .catch((err) => logError('Error fetching bank history:', err));
    }
  }, [user]);

  const handleTransaction = async (
    type: 'deposit' | 'withdraw',
    amount: bigint,
  ) => {
    if (amount <= 0) return;
    if (type === 'deposit' && amount > maxDeposit) return;
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
      if (data.error) throw new Error(data.error);
      alertService.success(`Successfully ${type}ed gold`);
      forceUpdate();
      if (type === 'deposit') setDepositAmount(BigInt(0));
      else setWithdrawAmount(BigInt(0));
    } catch (error) {
      alertService.error((error as Error).message);
    }
  };

  const historyRows = history.map((entry, index) => (
    <Table.Tr key={index}>
      <Table.Td>{new Date(entry?.date_time).toLocaleString()}</Table.Td>
      <Table.Td>{getTransactionType(entry, (key) => t(key))}</Table.Td>
      <Table.Td>
        {getGoldTxSymbol(entry, user)}
        {toLocale(entry.gold_amount, user?.locale)} gold
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <GameCard title={t('bank.deposit')}>
          <NumberInput
            label={t('bank.amount')}
            description={t('bank.depositHint', {
              percent: DEPOSIT_CAP_PERCENT,
            })}
            value={depositAmount.toString()}
            onChange={(val) => setDepositAmount(toBigIntSafe(val))}
            min={0}
            rightSection={
              <Button
                size="compact-xs"
                variant="subtle"
                aria-label={t('bank.depositMaxAria')}
                onClick={() => setDepositAmount(maxDeposit)}
              >
                {t('bank.max')}
              </Button>
            }
            rightSectionWidth={56}
            error={
              depositAmount > maxDeposit
                ? t('bank.depositOverCap', { percent: DEPOSIT_CAP_PERCENT })
                : undefined
            }
          />
          <Button
            mt="md"
            onClick={() => handleTransaction('deposit', depositAmount)}
          >
            {t('bank.deposit')}
          </Button>
        </GameCard>
        <GameCard title={t('bank.withdraw')}>
          <NumberInput
            label={t('bank.amount')}
            description={t('bank.withdrawHint', {
              amount: toLocale(bankBalance, user?.locale),
            })}
            value={withdrawAmount.toString()}
            onChange={(val) => setWithdrawAmount(toBigIntSafe(val))}
            min={0}
            rightSection={
              <Button
                size="compact-xs"
                variant="subtle"
                aria-label={t('bank.withdrawMaxAria')}
                onClick={() => setWithdrawAmount(bankBalance)}
              >
                {t('bank.max')}
              </Button>
            }
            rightSectionWidth={56}
          />
          <Button
            mt="md"
            onClick={() => handleTransaction('withdraw', withdrawAmount)}
          >
            {t('bank.withdraw')}
          </Button>
        </GameCard>
      </SimpleGrid>
      <Space h="md" />
      <GameCard title={t('bank.recentTransactions')}>
        <StyledTable
          headers={[t('bank.date'), t('bank.type'), t('bank.amount')]}
        >
          {historyRows}
        </StyledTable>
      </GameCard>
    </>
  );
}
