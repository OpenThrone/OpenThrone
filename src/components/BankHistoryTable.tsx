import React from 'react';
import { Table, Group, Text, Pagination } from '@mantine/core';
import toLocale from '@/utils/numberFormatting';
import { StyledTable } from './game/StyledTable';

interface BankHistoryTableProps {
  bankHistory?: any[];
  user?: any;
  message?: string | null;
  getTransactionType: (entry: any) => string;
  getGoldTxSymbol: (entry: any, user: any) => string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function BankHistoryTable({
  bankHistory = [],
  user,
  message,
  getTransactionType,
  getGoldTxSymbol,
  page,
  totalPages,
  onPageChange,
}: BankHistoryTableProps) {
   
  if (message) return <Text ta="center" p="md">{message}</Text>;
  if (!bankHistory || bankHistory.length === 0) return <Text ta="center" p="md">No Records Found</Text>;

  const rows = bankHistory.map((entry, index) => {
    const transactionType = getTransactionType(entry);
    const displayAmount = transactionType === 'Daily Reward'
      ? `+${entry.stats.newCitizens - entry.stats.currentCitizens} Citizens`
      : `${getGoldTxSymbol(entry, user)}${toLocale(entry.gold_amount, user?.locale)} gold`;

    return (
      <Table.Tr key={index}>
        <Table.Td>{new Date(entry.date_time).toLocaleString()}</Table.Td>
        <Table.Td>{transactionType}</Table.Td>
        <Table.Td>{displayAmount}</Table.Td>
      </Table.Tr>
    );
  });

  return (
    <>
      <StyledTable headers={['Date', 'Transaction Type', 'Amount']}>
        {rows}
      </StyledTable>
      <Group justify="center" mt="md">
        <Pagination value={page} onChange={onPageChange} total={totalPages} />
      </Group>
    </>
  );
}
