import React, { useState, useEffect } from 'react';
import { Paper, Table, Space, NumberInput, Button, Group, Text } from '@mantine/core';
import toLocale, { stringifyObj } from '@/utils/numberFormatting';
import { alertService } from '@/services';

export default function BankDepositWithdraw({
  user,
  forceUpdate,
  bankHistory,
  setDepositsAvailable,
  setNextDepositAvailable,
  colorScheme,
}) {
  const [depositAmount, setDepositAmount] = useState(BigInt(0));
  const [withdrawAmount, setWithdrawAmount] = useState(BigInt(0));
  const [depositError, setDepositError] = useState('');
  const [withdrawError, setWithdrawError] = useState('');

  useEffect(() => {
    if (user) {
      // Validate deposit/withdraw amounts whenever user or amounts change
      if (depositAmount > BigInt(Math.floor(parseInt(user?.gold?.toString()) * 0.8))) {
        setDepositError('Deposit amount exceeds the maximum allowed (80% of gold on hand).');
      } else {
        setDepositError('');
      }

      if (withdrawAmount > BigInt(user?.goldInBank?.toString())) {
        setWithdrawError('Withdraw amount exceeds your banked gold.');
      } else {
        setWithdrawError('');
      }
    }
  }, [user, depositAmount, withdrawAmount]);

  const handleDeposit = async () => {
    if (depositError) return;
    try {
      const response = await fetch('/api/bank/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stringifyObj({ depositAmount })),
      });

      const data = await response.json();
      if (data.error) {
        alertService.error(data.error);
      } else {
        alertService.success('Successfully deposited gold');
        forceUpdate();
        // Refresh deposit counters
        fetch('/api/bank/getDeposits')
          .then((resp) => resp.json())
          .then((depositData) => {
            setDepositsAvailable(depositData.deposits);
            setNextDepositAvailable(depositData.nextDepositAvailable);
          })
          .catch((error) => console.error('Error fetching bank deposits:', error));
        setDepositAmount(BigInt(0));
      }
    } catch (error) {
      console.error('Error depositing:', error);
      alertService.error('Failed to deposit gold. Please try again.');
    }
  };

  const handleWithdraw = async () => {
    if (withdrawError) return;
    try {
      const response = await fetch('/api/bank/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stringifyObj({ withdrawAmount })),
      });
      const data = await response.json();

      if (data.error) {
        alertService.error(data.error);
      } else {
        alertService.success('Successfully withdrew gold');
        forceUpdate();
        setWithdrawAmount(BigInt(0));
      }
    } catch (error) {
      console.error('Error withdrawing:', error);
      alertService.error('Failed to withdraw gold. Please try again.');
    }
  };

  // A quick helper to get the transaction type
  const getTransactionType = (entry) => {
    const { from_user_id, to_user_id, from_user_account_type, history_type, stats } = entry;
    // your existing logic
    if (from_user_id === to_user_id) {
      if (from_user_account_type === 'HAND') {
        if (history_type === 'SALE') return 'Purchase';
        return stats?.type === 'CONVERT' ? 'Unit Conversion' : 'Deposit';
      }
      return history_type === 'SALE' ? 'Sale' : 'Withdraw';
    }
    if (history_type === 'SALE') {
      switch (stats?.type) {
        case 'TRAINING_UNTRAIN':
          return 'Untrain Units';
        case 'TRAINING_TRAIN':
          return 'Train Units';
        case 'TRAINING_CONVERSION':
          return 'Convert Units';
        case 'BATTLE_UPGRADES_BUY':
          return 'Battle Upgrade Purchase';
        case 'BATTLE_UPGRADES_SELL':
          return 'Battle Upgrade Sale';
      }
    }
    if (history_type === 'PLAYER_TRANSFER') return 'Player Transfer';
    if (history_type === 'RECRUITMENT') return 'Recruitment';
    if (history_type === 'ECONOMY') return 'Income';
    if (history_type === 'FORT_REPAIR') return 'Fort Repair';
    if (history_type === 'WAR_SPOILS') return 'War Spoils';
    if (history_type === 'DAILY_RECRUIT') return 'Daily Reward';
    return 'UNKNOWN';
  };

  const getGoldTxSymbol = (entry) => {
    const transactionType = getTransactionType(entry);
    // your existing logic to figure out + or -
    if (transactionType === 'Recruitment' || transactionType === 'Income') return '+';
    if (transactionType === 'War Spoils' && entry.to_user_id === user?.id) return '+';
    // else default
    return '-';
  };

  // Show the last 10 deposit/withdraw records
  const depositWithdrawRows = bankHistory
    .filter((entry) => entry.from_user_id === entry.to_user_id)
    .slice(0, 10);

  return (
    <>
      <Group align="stretch" grow>
        <Paper shadow="xs" p="md" className="flex flex-col">
          {/* Deposit Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleDeposit();
            }}
            className="flex flex-col justify-between flex-grow"
          >
            <div>
              <label htmlFor="depositAmount" className="block">
                Amount to Deposit
              </label>
              <label className="text-sm text-gray-600 mb-2 block">
                You can deposit up to 80% of your gold per transaction
              </label>
              <NumberInput
                value={depositAmount.toString()}
                onChange={(value) => setDepositAmount(BigInt(value))}
                max={Math.floor(parseInt(user?.gold?.toString()) * 0.8)}
                placeholder="0"
                min={0}
                hideControls
                allowNegative={false}
                error={depositError}
                rightSection={
                  <Button
                    size="compact-xs"
                    c="dimmed"
                    onClick={() => {
                      setDepositAmount(
                        BigInt(Math.floor(parseInt(user?.gold?.toString()) * 0.8))
                      );
                    }}
                  >
                    Max
                  </Button>
                }
                rightSectionWidth={50}
              />
            </div>
            <Button
              type="submit"
              className="mt-4 px-4 py-2 text-white"
              color={
                colorScheme === 'ELF'
                  ? 'green'
                  : colorScheme === 'GOBLIN'
                    ? 'red'
                    : colorScheme === 'UNDEAD'
                      ? 'dark'
                      : 'blue'
              }
            >
              Deposit
            </Button>
          </form>
        </Paper>
        <Paper shadow="xs" p="md" className="flex flex-col">
          {/* Withdraw Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleWithdraw();
            }}
            className="flex flex-col justify-between flex-grow"
          >
            <div>
              <label htmlFor="withdrawAmount" className="block">
                Amount to Withdraw
              </label>
              <label className="text-sm text-gray-600 mb-2 block">
                There are no limits to the amount you can withdraw
              </label>
              <NumberInput
                value={withdrawAmount.toString()}
                onChange={(value) => setWithdrawAmount(BigInt(value))}
                placeholder="0"
                min={0}
                max={parseInt(user?.goldInBank?.toString())}
                hideControls
                allowNegative={false}
                error={withdrawError}
                rightSection={
                  <>
                    <Button
                      type="button"
                      size="compact-xs"
                      c="dimmed"
                      mr={5}
                      onClick={() => {
                        setWithdrawAmount(
                          BigInt(
                            Math.floor(parseInt(user?.goldInBank?.toString()) * 0.1)
                          )
                        );
                      }}
                    >
                      10%
                    </Button>
                    <Button
                      type="button"
                      size="compact-xs"
                      c="dimmed"
                      mr={5}
                      onClick={() => {
                        setWithdrawAmount(
                          BigInt(
                            Math.floor(parseInt(user?.goldInBank?.toString()) * 0.25)
                          )
                        );
                      }}
                    >
                      25%
                    </Button>
                    <Button
                      type="button"
                      size="compact-xs"
                      c="dimmed"
                      mr={5}
                      onClick={() => {
                        setWithdrawAmount(
                          BigInt(
                            Math.floor(parseInt(user?.goldInBank?.toString()) * 0.5)
                          )
                        );
                      }}
                    >
                      50%
                    </Button>
                    <Button
                      type="button"
                      size="compact-xs"
                      c="dimmed"
                      onClick={() => {
                        setWithdrawAmount(
                          BigInt(Math.floor(parseInt(user?.goldInBank?.toString())))
                        );
                      }}
                    >
                      100%
                    </Button>
                  </>
                }
                rightSectionWidth={200}
              />
            </div>
            <Button
              type="submit"
              className="mt-4 px-4 py-2 text-white"
              color={
                colorScheme === 'ELF'
                  ? 'green'
                  : colorScheme === 'GOBLIN'
                    ? 'red'
                    : colorScheme === 'UNDEAD'
                      ? 'dark'
                      : 'blue'
              }
            >
              Withdraw
            </Button>
          </form>
        </Paper>
      </Group>

      <Space h="md" />

      {/* Last 10 Deposit/Withdraw Records */}
      <Paper shadow="xs" p="md">
        <Table className="min-w-full border-neutral-500" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Transaction Type</Table.Th>
              <Table.Th>Amount</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {depositWithdrawRows.map((entry, index) => {
              const transactionType = getTransactionType(entry);
              return (
                <Table.Tr key={index}>
                  <Table.Td>
                    {new Date(entry?.date_time).toLocaleDateString()}{' '}
                    {new Date(entry?.date_time).toLocaleTimeString()}
                  </Table.Td>
                  <Table.Td>{transactionType}</Table.Td>
                  <Table.Td>
                    {getGoldTxSymbol(entry) +
                      toLocale(entry.gold_amount, user?.locale)}{' '}
                    gold
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>
    </>
  );
}
