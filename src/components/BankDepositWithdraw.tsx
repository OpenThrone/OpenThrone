import { Button, Group, NumberInput, Space, Table } from '@mantine/core';
import React, { useEffect, useState } from 'react';

import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';
import toLocale from '@/utils/numberFormatting';
import { getGoldTxSymbol, getTransactionType } from '@/utils/utilities';

import { GameCard } from './game/GameCard';
import { StyledTable } from './game/StyledTable';

export default function BankDepositWithdraw({ user, forceUpdate }) {
  const [depositAmount, setDepositAmount] = useState(BigInt(0));
  const [withdrawAmount, setWithdrawAmount] = useState(BigInt(0));
  const [history, setHistory] = useState([]);

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
    try {
      const response = await fetch(`/api/bank/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      <Table.Td>{getTransactionType(entry)}</Table.Td>
      <Table.Td>
        {getGoldTxSymbol(entry, user)}
        {toLocale(entry.gold_amount, user?.locale)} gold
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group grow>
        <GameCard title="Deposit">
          <NumberInput
            label="Amount"
            value={depositAmount.toString()}
            onChange={(val) => setDepositAmount(BigInt(val))}
            min={0}
          />
          <Button
            mt="md"
            onClick={() => handleTransaction('deposit', depositAmount)}
          >
            Deposit
          </Button>
        </GameCard>
        <GameCard title="Withdraw">
          <NumberInput
            label="Amount"
            value={withdrawAmount.toString()}
            onChange={(val) => setWithdrawAmount(BigInt(val))}
            min={0}
          />
          <Button
            mt="md"
            onClick={() => handleTransaction('withdraw', withdrawAmount)}
          >
            Withdraw
          </Button>
        </GameCard>
      </Group>
      <Space h="md" />
      <GameCard title="Recent Transactions">
        <StyledTable headers={['Date', 'Type', 'Amount']}>
          {historyRows}
        </StyledTable>
      </GameCard>
    </>
  );
}
