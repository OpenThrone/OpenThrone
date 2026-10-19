import { Badge, Button, Table } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { OffensiveUpgrades } from '@/constants';
import type { BattleUpgradeProps, Locales } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';
import { fortificationName, structureName } from '@/utils/structureNames';

import { StyledTable } from './game/StyledTable';

const OffenseUpgrade: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t, i18n } = useTranslation(['structures', 'common']);
  const locale = i18n.language as Locales;

  const rows = Object.values(OffensiveUpgrades)
    .filter((item) => item.level <= fortLevel + 2)
    .map((item, index) => (
      <Table.Tr key={`${item.name}_${item.level}`}>
        <Table.Td>
          {structureName(t, 'offense', item.level, item.name)}{' '}
          {item.level === userLevel && (
            <Badge color="yellow" ml={5}>
              {t('labels.owned', { ns: 'common' })}
            </Badge>
          )}
        </Table.Td>
        <Table.Td>{fortificationName(t, item.fortLevelRequirement)}</Table.Td>
        <Table.Td>
          {t('upgrades.offenseBonus')}: {item.offenseBonusPercentage}%
        </Table.Td>
        <Table.Td>
          {toLocale(item.cost, locale)} {t('currency.gold', { ns: 'common' })}
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
                  name: fortificationName(t, item.fortLevelRequirement),
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
