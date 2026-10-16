import { Badge, Button, Table } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { ArmoryUpgrades, Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';

import { StyledTable } from './game/StyledTable';

const ArmoryUpgradesTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t } = useTranslation(['structures', 'common']);
  const { user } = useUser();

  const rows = Object.values(ArmoryUpgrades)
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
        <Table.Td>{t('upgrades.armoryItems', { level: item.level })}</Table.Td>
        <Table.Td>
          {toLocale(item.cost, user?.locale)}{' '}
          {t('currency.gold', { ns: 'common' })}
        </Table.Td>
        <Table.Td>
          {item.level > userLevel && item.fortLevel <= fortLevel ? (
            <Button onClick={() => buyUpgrade('armory', index, forceUpdate)}>
              {t('labels.buy', { ns: 'common' })}
            </Button>
          ) : (
            item.level > userLevel && (
              <span>
                {t('upgrades.unlockWithFort', {
                  name: Fortifications.find((f) => f.level === item.fortLevel)
                    ?.name,
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
        t('labels.bonus', { ns: 'common' }),
        t('labels.cost', { ns: 'common' }),
        t('labels.action', { ns: 'common' }),
      ]}
    >
      {rows}
    </StyledTable>
  );
};

export default ArmoryUpgradesTab;
