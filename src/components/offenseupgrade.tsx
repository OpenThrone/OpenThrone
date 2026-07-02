import { Badge, Button, Table } from '@mantine/core';
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
  const { user } = useUser();

  const rows = Object.values(OffensiveUpgrades)
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
        <Table.Td>
          {
            Fortifications.find((f) => f.level === item.fortLevelRequirement)
              ?.name
          }
        </Table.Td>
        <Table.Td>Offense Bonus: {item.offenseBonusPercentage}%</Table.Td>
        <Table.Td>{toLocale(item.cost, user?.locale)} Gold</Table.Td>
        <Table.Td>
          {item.level === userLevel + 1 &&
          item.fortLevelRequirement <= fortLevel ? (
            <Button onClick={() => buyUpgrade('offense', index, forceUpdate)}>
              Buy
            </Button>
          ) : (
            item.fortLevelRequirement > fortLevel && (
              <span>
                Unlock with:{' '}
                {
                  Fortifications.find(
                    (f) => f.level === item.fortLevelRequirement,
                  )?.name
                }
              </span>
            )
          )}
        </Table.Td>
      </Table.Tr>
    ));

  return (
    <StyledTable headers={['Name', 'Fort Req.', 'Bonus', 'Cost', 'Action']}>
      {rows}
    </StyledTable>
  );
};

export default OffenseUpgrade;
