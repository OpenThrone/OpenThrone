import { Badge, Button, Table } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { SpyUpgrades } from '@/constants';
import type {
  BattleUpgradeProps,
  Locales,
  SpyUpgradeType,
} from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';
import { fortificationName, structureName } from '@/utils/structureNames';

import { StyledTable } from './game/StyledTable';

const ClandestineUpgrade: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t, i18n } = useTranslation(['structures', 'common']);
  const locale = i18n.language as Locales;

  const renderUpgradeAction = (item: SpyUpgradeType, index: number) => {
    if (index === userLevel && item.fortLevelRequirement <= fortLevel) {
      return (
        <Button onClick={() => buyUpgrade('spy', index, forceUpdate)}>
          {t('labels.buy', { ns: 'common' })}
        </Button>
      );
    }
    if (item.fortLevelRequirement > fortLevel) {
      return (
        <span>
          {t('upgrades.unlockWithFort', {
            name: fortificationName(t, item.fortLevelRequirement),
          })}
        </span>
      );
    }
    if (index > userLevel) {
      return (
        <span>
          {t('upgrades.unlockWithUpgrade', {
            name: structureName(
              t,
              'spy',
              SpyUpgrades[index - 1]?.level,
              SpyUpgrades[index - 1]?.name,
            ),
          })}
        </span>
      );
    }
    return null;
  };

  const rows = Object.values(SpyUpgrades)
    .filter((item) => item.fortLevelRequirement <= fortLevel + 2)
    .map((item, index) => (
      <Table.Tr key={`${item.level}_${item.name}`}>
        <Table.Td>
          {structureName(t, 'spy', item.level, item.name)}{' '}
          {item.level === userLevel && (
            <Badge color="yellow" ml={5}>
              {t('labels.owned', { ns: 'common' })}
            </Badge>
          )}
        </Table.Td>
        <Table.Td>{fortificationName(t, item.fortLevelRequirement)}</Table.Td>
        <Table.Td>
          {t('upgrades.spyBonus')}: {item.offenseBonusPercentage}%<br />
          {t('upgrades.maxInfiltrations')}: {item.maxInfiltrations}
          <br />
          {t('upgrades.maxAssassinations')}: {item.maxAssassinations}
        </Table.Td>
        <Table.Td>
          {toLocale(item.cost, locale)} {t('currency.gold', { ns: 'common' })}
        </Table.Td>
        <Table.Td>{renderUpgradeAction(item, index)}</Table.Td>
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

export default ClandestineUpgrade;
