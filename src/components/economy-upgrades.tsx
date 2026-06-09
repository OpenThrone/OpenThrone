import { Badge, Button, Table } from '@mantine/core';

import { EconomyUpgrades, Fortifications } from '@/constants';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';

import { StyledTable } from './game/StyledTable';

const EconomyTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  forceUpdate,
  fortLevel,
}) => {
  const rows = Object.values(EconomyUpgrades)
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
        <Table.Td>{item.goldPerWorker}</Table.Td>
        <Table.Td>{item.depositsPerDay}</Table.Td>
        <Table.Td>
          {toLocale(item.goldTransferTx)}/{toLocale(item.goldTransferRec)}
        </Table.Td>
        <Table.Td>{toLocale(item.cost)}</Table.Td>
        <Table.Td>
          {item.index === userLevel + 1 && item.fortLevel <= fortLevel ? (
            <Button onClick={() => buyUpgrade('economy', index, forceUpdate)}>
              Buy
            </Button>
          ) : (
            item.index > userLevel && (
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
    <StyledTable
      headers={[
        'Name',
        'Fort Req.',
        'Gold/Worker',
        'Deposits/Day',
        'Gold Transfer',
        'Cost',
        'Action',
      ]}
    >
      {rows}
    </StyledTable>
  );
};

export default EconomyTab;
