import { Badge, Button, Table, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { StyledTable } from '@/components/game/StyledTable';
import type { Locales } from '@/types/typings';
import { toLocale } from '@/utils/numberFormatting';
import { fortificationName } from '@/utils/structureNames';

/** What must be reached before a level can be bought. */
export interface UpgradeRequirement {
  type: 'fort' | 'level';
  /** Fort level or player level required. */
  value: number;
  met: boolean;
}

export interface UpgradeLedgerRow {
  key: string;
  name: string;
  /**
   * Rank compared against `ownedPosition`: the row equal to it is owned and
   * the row one above it is the only one that can be bought.
   */
  position: number;
  /** Index sent to the upgrades API; must match the server's rule. */
  purchaseIndex: number;
  /** Cells between the name and cost columns, in `columns` order. */
  cells: ReactNode[];
  cost: number | string | bigint;
  requirement: UpgradeRequirement;
}

export type UpgradeRowState = 'owned' | 'buy' | 'locked' | 'queued' | 'past';

/** One owned check and one next-level buy rule for every structure ledger. */
export const upgradeRowState = (
  position: number,
  ownedPosition: number,
  requirementMet: boolean,
): UpgradeRowState => {
  if (position === ownedPosition) return 'owned';
  if (position < ownedPosition) return 'past';
  if (!requirementMet) return 'locked';
  return position === ownedPosition + 1 ? 'buy' : 'queued';
};

interface UpgradeLedgerProps {
  /** Headers for `cells`; Name, Cost and Action are added by the ledger. */
  columns: string[];
  rows: UpgradeLedgerRow[];
  ownedPosition: number;
  /** Resolves when the purchase request settles. */
  onBuy: (purchaseIndex: number) => Promise<unknown>;
}

/** Structure upgrade ledger: owned badge, next-level Buy and locked copy. */
export function UpgradeLedger({
  columns,
  rows,
  ownedPosition,
  onBuy,
}: UpgradeLedgerProps) {
  const { t, i18n } = useTranslation(['structures', 'common']);
  const locale = i18n.language as Locales;
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const buy = async (row: UpgradeLedgerRow) => {
    if (pendingKey) return;
    setPendingKey(row.key);
    try {
      await onBuy(row.purchaseIndex);
    } finally {
      setPendingKey(null);
    }
  };

  const lockedCopy = (requirement: UpgradeRequirement) =>
    requirement.type === 'fort'
      ? t('upgrades.unlockWithFort', {
          name: fortificationName(t, requirement.value),
        })
      : t('upgrades.unlockWithLevel', { level: requirement.value });

  return (
    <StyledTable
      headers={[
        t('labels.name', { ns: 'common' }),
        ...columns,
        t('labels.cost', { ns: 'common' }),
        t('labels.action', { ns: 'common' }),
      ]}
    >
      {rows.map((row, index) => {
        const state = upgradeRowState(
          row.position,
          ownedPosition,
          row.requirement.met,
        );
        const previous = rows[index - 1];
        return (
          <Table.Tr key={row.key} data-state={state}>
            <Table.Td>
              {row.name}{' '}
              {state === 'owned' && (
                <Badge color="yellow" ml={5}>
                  {t('labels.owned', { ns: 'common' })}
                </Badge>
              )}
            </Table.Td>
            {row.cells.map((cell, cellIndex) => (
              <Table.Td key={cellIndex}>{cell}</Table.Td>
            ))}
            <Table.Td>
              {toLocale(row.cost, locale)}{' '}
              {t('currency.gold', { ns: 'common' })}
            </Table.Td>
            <Table.Td>
              {state === 'buy' && (
                <Button
                  onClick={() => buy(row)}
                  loading={pendingKey === row.key}
                  disabled={pendingKey !== null}
                >
                  {t('labels.buy', { ns: 'common' })}
                </Button>
              )}
              {state === 'locked' && (
                <Text size="sm" c="var(--ot-muted)">
                  {lockedCopy(row.requirement)}
                </Text>
              )}
              {state === 'queued' && previous && (
                <Text size="sm" c="var(--ot-muted)">
                  {t('upgrades.unlockWithUpgrade', { name: previous.name })}
                </Text>
              )}
            </Table.Td>
          </Table.Tr>
        );
      })}
    </StyledTable>
  );
}
