import { Badge, Button, Table } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { Fortifications, OffensiveUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';

import { StyledTable } from './game/StyledTable';

const OffenseUpgrade: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t } = useTranslation(['structures', 'common']);
  const { user } = useUser();

  const rows = Object.values(OffensiveUpgrades)
    .filter((item) => item.level <= fortLevel + 2)
    .map((item, index) => (
      <Table.Tr key={`${item.name}_${item.level}`}>
        <Table.Td>
          {item.name}{' '}
          {item.level === userLevel && (
            <Badge color="yellow" ml={5}>
              {t('labels.owned', { ns: 'common' })}
            </Badge>
          )}
        </Table.Td>
        <Table.Td>
          {
            Fortifications.find((f) => f.level === item.fortLevelRequirement)
              ?.name
          }
        </Table.Td>
        <Table.Td>
          {t('upgrades.offenseBonus')}: {item.offenseBonusPercentage}%
        </Table.Td>
        <Table.Td>
          {toLocale(item.cost, user?.locale)}{' '}
          {t('currency.gold', { ns: 'common' })}
        </Table.Td>
        <Table.Td>
          {item.level === userLevel + 1 &&
          item.fortLevelRequirement <= fortLevel ? (
            <Button onClick={() => buyUpgrade('offense', index, forceUpdate)}>
              {t('labels.buy', { ns: 'common' })}
            </Button>
          ) : (
            item.fortLevelRequirement > fortLevel && (
              <span>
                {t('upgrades.unlockWith', {
                  name: Fortifications.find(
                    (f) => f.level === item.fortLevelRequirement,
                  )?.name,
                })}
              </span>
            )
          )}
        </Table.Td>
      </Table.Tr>
    ));

  return (
    <StyledTable
      headers={[
        t('labels.name', { ns: 'common' }),
        t('upgrades.fortReq'),
        t('labels.bonus', { ns: 'common' }),
        t('labels.cost', { ns: 'common' }),
        t('labels.action', { ns: 'common' }),
      ]}
    >
      {rows}
    </StyledTable>
  );
};

export default OffenseUpgrade;
