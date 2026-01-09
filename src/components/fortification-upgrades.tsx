import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';
import { Badge, Button, Table } from '@mantine/core';
import { StyledTable } from './game/StyledTable';

const FortificationsTab: React.FC<BattleUpgradeProps> = ({ userLevel, fortLevel }) => {
  const { forceUpdate, user } = useUser();
  const colorScheme = user?.colorScheme;

  const rows = Object.values(Fortifications)
    .filter((item) => item.level <= fortLevel + 2)
    .map((item, index) => (
      <Table.Tr key={`${item.level}_${item.name}`}>
        <Table.Td>
          {item.name} {item.level === fortLevel && <Badge color="yellow" ml={5}>Owned</Badge>}
        </Table.Td>
        <Table.Td>{item.levelRequirement}</Table.Td>
        <Table.Td>
          Gold Per Turn: {toLocale(item.goldPerTurn, user?.locale)}<br />
          Defense Bonus: {item.defenseBonusPercentage}%<br />
          Max HP: {toLocale(item.hitpoints, user?.locale)}
        </Table.Td>
        <Table.Td>{toLocale(item.cost, user?.locale)} Gold</Table.Td>
        <Table.Td>
          {item.level === fortLevel + 1 && item.levelRequirement <= userLevel ? (
            <Button onClick={() => buyUpgrade('fortifications', index, forceUpdate)}>Buy</Button>
          ) : (
            item.level === fortLevel + 1 && <span>Unlock at level {item.levelRequirement}</span>
          )}
        </Table.Td>
      </Table.Tr>
    ));

  return (
    <StyledTable headers={['Name', 'Level Req.', 'Bonus', 'Cost', 'Action']}>
      {rows}
    </StyledTable>
  );
};

export default FortificationsTab;
