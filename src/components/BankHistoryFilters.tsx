import { Chip, Group } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

/** Filter keys sent to /api/bank/history mapped to `bank.filters` label keys. */
const FILTERS: { key: string; label: string }[] = [
  { key: 'war_spoils', label: 'warSpoils' },
  { key: 'deposits', label: 'deposits' },
  { key: 'withdraws', label: 'withdraws' },
  { key: 'transfers', label: 'transfers' },
  { key: 'sale', label: 'sale' },
  { key: 'training', label: 'training' },
  { key: 'recruitment', label: 'recruitment' },
  { key: 'economy', label: 'income' },
  { key: 'fortification', label: 'fortRepairs' },
  { key: 'daily', label: 'dailyRewards' },
];

/** Bank history filters. */
export default function BankHistoryFilters({
  colorScheme,
  filters,
  setFilters,
}) {
  const { t } = useTranslation('structures');
  const toggleFilter = (key) => {
    setFilters({
      ...filters,
      [key]: !filters[key],
    });
  };

  const color =
    colorScheme === 'ELF'
      ? 'green'
      : colorScheme === 'GOBLIN'
        ? 'red'
        : colorScheme === 'UNDEAD'
          ? 'gray'
          : 'blue';

  return (
    <Group>
      {FILTERS.map(({ key, label }) => (
        <Chip
          key={key}
          variant="filled"
          checked={filters[key]}
          onChange={() => toggleFilter(key)}
          color={color}
        >
          {t(`bank.filters.${label}`)}
        </Chip>
      ))}
    </Group>
  );
}
