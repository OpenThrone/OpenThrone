import { Group, Pagination, Table, Text } from '@mantine/core';
import type { TFunction } from 'i18next';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { EmptyState } from '@/components/game/EmptyState';
import type { Locales } from '@/types/typings';
import { formatGold } from '@/utils/numberFormatting';
import { getGoldTxSymbol, getTransactionType } from '@/utils/utilities';

import { StyledTable } from './game/StyledTable';

const EMPTY_BANK_HISTORY: any[] = [];

/** English labels from getTransactionType mapped to `bank.transactionTypes` keys. */
const TRANSACTION_TYPE_KEYS: Record<string, string> = {
  'Armory Purchase': 'armoryPurchase',
  'Armory Sale': 'armorySale',
  'Armory Upgrade': 'armoryUpgrade',
  'Armory Conversion': 'armoryConversion',
  'Mercenary Hire': 'mercenaryHire',
  'Untrain Units': 'untrainUnits',
  'Train Units': 'trainUnits',
  'Convert Units': 'convertUnits',
  'Battle Upgrade Purchase': 'battleUpgradePurchase',
  'Battle Upgrade Sale': 'battleUpgradeSale',
  Purchase: 'purchase',
  'Unit Conversion': 'unitConversion',
  Deposit: 'deposit',
  Withdraw: 'withdraw',
  Sale: 'sale',
  'Player Transfer': 'playerTransfer',
  Recruitment: 'recruitment',
  Income: 'income',
  'Fort Repair': 'fortRepair',
  'War Spoils': 'warSpoils',
  'Daily Reward': 'dailyReward',
  UNKNOWN: 'unknown',
};

/** Translated transaction type label for a bank history entry. */
export const translateTransactionType = (entry: any, t: TFunction): string => {
  const label = getTransactionType(entry);
  const key = TRANSACTION_TYPE_KEYS[label];
  return key
    ? t(`bank.transactionTypes.${key}`, {
        ns: 'structures',
        defaultValue: label,
      })
    : label;
};

/** Signed, locale-formatted gold amount for a bank history entry. */
export const formatTransactionGold = (
  entry: any,
  user: any,
  t: TFunction,
  locale: string,
): string =>
  t('currency.goldAmount', {
    ns: 'common',
    amount: `${getGoldTxSymbol(entry, user)}${formatGold(entry.gold_amount, locale as Locales)}`,
  });

interface BankHistoryTableProps {
  bankHistory?: any[];
  user?: any;
  message?: string | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Bank history table. */
export default function BankHistoryTable({
  bankHistory = EMPTY_BANK_HISTORY,
  user,
  message,
  page,
  totalPages,
  onPageChange,
}: BankHistoryTableProps) {
  const { t, i18n } = useTranslation('structures');
  const locale = user?.locale ?? (i18n.language as Locales);

  if (message)
    return (
      <Text ta="center" p="md">
        {message}
      </Text>
    );
  if (!bankHistory || bankHistory.length === 0)
    return <EmptyState compact title={t('bank.noRecords')} />;

  const rows = bankHistory.map((entry, index) => {
    const displayAmount =
      getTransactionType(entry) === 'Daily Reward'
        ? t('bank.citizensGained', {
            count: entry.stats.newCitizens - entry.stats.currentCitizens,
          })
        : formatTransactionGold(entry, user, t, locale);

    return (
      <Table.Tr key={index}>
        <Table.Td>{new Date(entry.date_time).toLocaleString(locale)}</Table.Td>
        <Table.Td>{translateTransactionType(entry, t)}</Table.Td>
        <Table.Td>{displayAmount}</Table.Td>
      </Table.Tr>
    );
  });

  return (
    <>
      <StyledTable headers={[t('bank.date'), t('bank.type'), t('bank.amount')]}>
        {rows}
      </StyledTable>
      <Group justify="center" mt="md">
        {/* page is 0-based (API offset = page * limit); Mantine Pagination is 1-based. */}
        <Pagination
          value={page + 1}
          onChange={(next) => onPageChange(next - 1)}
          total={totalPages}
        />
      </Group>
    </>
  );
}
