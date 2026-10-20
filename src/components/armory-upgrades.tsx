import { Badge, Button, Table } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { ArmoryUpgrades } from '@/constants';
import type { BattleUpgradeProps, Locales } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';
import { fortificationName, structureName } from '@/utils/structureNames';

import { StyledTable } from './game/StyledTable';

const ArmoryUpgradesTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t, i18n } = useTranslation(['structures', 'common']);
  const locale = i18n.language as Locales;

  const rows = Object.values(ArmoryUpgrades)
    .filter((item) => item.level <= fortLevel + 2)
    .map((item, index) => (
      <Table.Tr key={`${item.name}_${item.level}`}>
        <Table.Td>
          {structureName(t, 'armory', item.level, item.name)}{' '}
          {item.level === userLevel && (
            <Badge color="yellow" ml={5}>
              {t('labels.owned', { ns: 'common' })}
            </Badge>
          )}
        </Table.Td>
        <Table.Td>{t('upgrades.armoryItems', { level: item.level })}</Table.Td>
        <Table.Td>
          {toLocale(item.cost, locale)} {t('currency.gold', { ns: 'common' })}
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
                  name: fortificationName(t, item.fortLevel),
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
