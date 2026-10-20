import { Badge, Button, Table } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { HouseUpgrades } from '@/constants';
import type { BattleUpgradeProps, Locales } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';
import { fortificationName, structureName } from '@/utils/structureNames';

import { StyledTable } from './game/StyledTable';

const HousingTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t, i18n } = useTranslation(['structures', 'common']);
  const locale = i18n.language as Locales;

  const rows = Object.values(HouseUpgrades)
    .filter((item) => item.index <= userLevel + 2)
    .map((item, index) => (
      <Table.Tr key={item.index}>
        <Table.Td>
          {structureName(t, 'housing', item.index, item.name)}{' '}
          {index === userLevel && (
            <Badge color="yellow" ml={5}>
              {t('labels.owned', { ns: 'common' })}
            </Badge>
          )}
        </Table.Td>
        <Table.Td>
          {fortificationName(t, item.fortLevel) || t('upgrades.manor')}
        </Table.Td>
        <Table.Td>{item.citizensDaily}</Table.Td>
        <Table.Td>
          {toLocale(item.cost, locale)} {t('currency.gold', { ns: 'common' })}
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
