import { Badge, Button, Table } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { Fortifications, HouseUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';

import { StyledTable } from './game/StyledTable';

const HousingTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t } = useTranslation(['structures', 'common']);
  const { user } = useUser();

  const rows = Object.values(HouseUpgrades)
    .filter((item) => item.index <= userLevel + 2)
    .map((item, index) => (
      <Table.Tr key={item.index}>
        <Table.Td>
          {item.name}{' '}
          {index === userLevel && (
            <Badge color="yellow" ml={5}>
              {t('labels.owned', { ns: 'common' })}
            </Badge>
          )}
        </Table.Td>
        <Table.Td>
          {Fortifications.find((fort) => fort.level === item.fortLevel)?.name ||
            t('upgrades.manor')}
        </Table.Td>
        <Table.Td>{item.citizensDaily}</Table.Td>
        <Table.Td>
          {toLocale(item.cost, user?.locale)}{' '}
          {t('currency.gold', { ns: 'common' })}
        </Table.Td>
        <Table.Td>
          {item.index === userLevel + 1 && item.fortLevel <= fortLevel ? (
            <Button onClick={() => buyUpgrade('houses', index, forceUpdate)}>
              {t('labels.buy', { ns: 'common' })}
            </Button>
          ) : (
            item.index > userLevel && (
              <span>
                {t('upgrades.unlockWith', {
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
        t('upgrades.fortReq'),
        t('upgrades.citizensPerDay'),
        t('labels.cost', { ns: 'common' }),
        t('labels.action', { ns: 'common' }),
      ]}
    >
      {rows}
    </StyledTable>
  );
};

export default HousingTab;
