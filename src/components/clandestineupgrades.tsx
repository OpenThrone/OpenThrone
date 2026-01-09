import React from 'react';
import { Fortifications, SpyUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps, SpyUpgradeType } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';
import { Badge, Button, Table } from '@mantine/core';
import { StyledTable } from './game/StyledTable';

const ClandestineUpgrade: React.FC<BattleUpgradeProps> = ({ userLevel, fortLevel, forceUpdate }) => {
  const { user } = useUser();

  const renderUpgradeAction = (item: SpyUpgradeType, index: number) => {
    if (index === userLevel && item.fortLevelRequirement <= fortLevel) {
      return <Button onClick={() => buyUpgrade('spy', index, forceUpdate)}>Buy</Button>;
    }
    if (item.fortLevelRequirement > fortLevel) {
      return <span>Unlock with Fort: {Fortifications.find(f => f.level === item.fortLevelRequirement)?.name}</span>;
    }
    if (index > userLevel) {
      return <span>Unlock with Upgrade: {SpyUpgrades[index - 1]?.name}</span>;
    }
    return null;
  };

  const rows = Object.values(SpyUpgrades)
    .filter((item) => item.fortLevelRequirement <= fortLevel + 2)
    .map((item, index) => (
      <Table.Tr key={`${item.level}_${item.name}`}>
        <Table.Td>
          {item.name} {item.level === userLevel && <Badge color="yellow" ml={5}>Owned</Badge>}
        </Table.Td>
        <Table.Td>{Fortifications.find(f => f.level === item.fortLevelRequirement)?.name}</Table.Td>
        <Table.Td>
          Spy Bonus: {item.offenseBonusPercentage}%<br />
          Max Infiltrations: {item.maxInfiltrations}<br />
          Max Assassinations: {item.maxAssassinations}
        </Table.Td>
        <Table.Td>{toLocale(item.cost, user?.locale)} Gold</Table.Td>
        <Table.Td>{renderUpgradeAction(item, index)}</Table.Td>
      </Table.Tr>
    ));

  return (
    <StyledTable headers={['Name', 'Fort Req.', 'Bonus', 'Cost', 'Action']}>
      {rows}
    </StyledTable>
  );
};

export default ClandestineUpgrade;
