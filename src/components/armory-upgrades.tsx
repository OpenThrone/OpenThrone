import { Badge, Button, Table } from '@mantine/core';
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
  const { user } = useUser();

  const rows = Object.values(ArmoryUpgrades)
    .filter((item) => item.level <= fortLevel + 2)
    .map((item, index) => (
      <Table.Tr key={`${item.name}_${item.level}`}>
        <Table.Td>
          {item.name}{' '}
          {item.level === userLevel && (
            <Badge color="yellow" ml={5}>
              Owned
            </Badge>
          )}
        </Table.Td>
        <Table.Td>Level {item.level} Armory items</Table.Td>
        <Table.Td>{toLocale(item.cost, user?.locale)} Gold</Table.Td>
        <Table.Td>
          {item.level > userLevel && item.fortLevel <= fortLevel ? (
            <Button onClick={() => buyUpgrade('armory', index, forceUpdate)}>
              Buy
            </Button>
          ) : (
            item.level > userLevel && (
              <span>
                Unlock with Fort:{' '}
                {Fortifications.find((f) => f.level === item.fortLevel)?.name}
              </span>
            )
          )}
        </Table.Td>
      </Table.Tr>
    ));

  return (
    <StyledTable headers={['Name', 'Bonus', 'Cost', 'Action']}>
      {rows}
    </StyledTable>
  );
};

export default ArmoryUpgradesTab;
