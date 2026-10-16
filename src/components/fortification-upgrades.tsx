import { Badge, Button, Table } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';

import { StyledTable } from './game/StyledTable';

const FortificationsTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
}) => {
  const { t } = useTranslation(['structures', 'common']);
  const { forceUpdate, user } = useUser();

  const rows = Object.values(Fortifications)
    .filter((item) => item.level <= fortLevel + 2)
    .map((item, index) => (
      <Table.Tr key={`${item.level}_${item.name}`}>
        <Table.Td>
          {item.name}{' '}
          {item.level === fortLevel && (
            <Badge color="yellow" ml={5}>
              {t('labels.owned', { ns: 'common' })}
            </Badge>
          )}
        </Table.Td>
        <Table.Td>{item.levelRequirement}</Table.Td>
        <Table.Td>
          {t('fortifications.goldPerTurn')}:{' '}
          {toLocale(item.goldPerTurn, user?.locale)}
          <br />
          {t('fortifications.defenseBonus')}: {item.defenseBonusPercentage}%
          <br />
          {t('upgrades.maxHp')}: {toLocale(item.hitpoints, user?.locale)}
        </Table.Td>
        <Table.Td>
          {toLocale(item.cost, user?.locale)}{' '}
          {t('currency.gold', { ns: 'common' })}
        </Table.Td>
        <Table.Td>
          {item.level === fortLevel + 1 &&
          item.levelRequirement <= userLevel ? (
            <Button
              onClick={() => buyUpgrade('fortifications', index, forceUpdate)}
            >
              {t('labels.buy', { ns: 'common' })}
            </Button>
          ) : (
            item.level === fortLevel + 1 && (
              <span>
                {t('upgrades.unlockAtLevel', {
                  level: item.levelRequirement,
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
        t('upgrades.levelReq'),
        t('labels.bonus', { ns: 'common' }),
        t('labels.cost', { ns: 'common' }),
        t('labels.action', { ns: 'common' }),
      ]}
    >
      {rows}
    </StyledTable>
  );
};

export default FortificationsTab;
