import { Badge, Button, Table } from '@mantine/core';

import { Fortifications, HouseUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';

import { StyledTable } from './game/StyledTable';

const HousingTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { user } = useUser();

  const rows = Object.values(HouseUpgrades)
    .filter((item) => item.index <= userLevel + 2)
    .map((item, index) => (
      <Table.Tr key={item.index}>
        <Table.Td>
          {item.name}{' '}
          {index === userLevel && (
            <Badge color="yellow" ml={5}>
              Owned
            </Badge>
          )}
        </Table.Td>
        <Table.Td>
          {Fortifications.find((fort) => fort.level === item.fortLevel)?.name ||
            'Manor'}
        </Table.Td>
        <Table.Td>{item.citizensDaily}</Table.Td>
        <Table.Td>{toLocale(item.cost, user?.locale)} Gold</Table.Td>
        <Table.Td>
          {item.index === userLevel + 1 && item.fortLevel <= fortLevel ? (
            <Button onClick={() => buyUpgrade('houses', index, forceUpdate)}>
              Buy
            </Button>
          ) : (
            item.index > userLevel && (
              <span>
                Unlock with{' '}
                {Fortifications.find((f) => f.level === item.fortLevel)?.name}
              </span>
            )
          )}
        </Table.Td>
      </Table.Tr>
    ));

  return (
    <StyledTable
      headers={['Name', 'Fort Req.', 'Citizens Per Day', 'Cost', 'Action']}
    >
      {rows}
    </StyledTable>
  );
};

export default HousingTab;
