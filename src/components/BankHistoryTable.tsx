import React from 'react';
import { Paper, Table, Space } from '@mantine/core';
import toLocale from '@/utils/numberFormatting';

export default function BankHistoryTable({
  bankHistory,
  user,
  message,
  getTransactionType,
  getGoldTxSymbol,
}) {
  if (message) {
    return <div className="text-center p-4">{message}</div>;
  }

  if (!bankHistory || bankHistory.length === 0) {
    return <div className="text-center p-4">No Records Found</div>;
  }

  return (
    <>
      <Space h="md" />
      <Paper shadow="xs">
        <Table className="min-w-full border-neutral-500" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Transaction Type</Table.Th>
              <Table.Th>Amount</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bankHistory.map((entry, index) => {
              const transactionType = getTransactionType(entry);
              let displayAmount = '';
              if (transactionType === 'Daily Reward') {
                // Example: "Daily Reward" might show Citizens instead of gold
                displayAmount = `+${entry.stats?.recruitingBonus} Citizens`;
              } else {
                displayAmount =
                  getGoldTxSymbol(entry) +
                  toLocale(entry.gold_amount, user?.locale) +
                  ' gold';
              }
              return (
                <Table.Tr key={index}>
                  <Table.Td>
                    {new Date(entry.date_time).toLocaleDateString()}{' '}
                    {new Date(entry.date_time).toLocaleTimeString()}
                  </Table.Td>
                  <Table.Td>{transactionType}</Table.Td>
                  <Table.Td>{displayAmount}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>
    </>
  );
}
