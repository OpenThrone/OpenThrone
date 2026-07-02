import { HoverCard, List } from '@mantine/core';
import { useMemo } from 'react';

import type { BattleUnits } from '@/types/typings';

const EMPTY_UNITS: BattleUnits[] = [];

interface LossesListProps {
  losses: string;
}
const LossesList: React.FC<LossesListProps> = ({ losses }) => {
  const parsed = useMemo<{ total: number; units: BattleUnits[] }>(() => {
    if (typeof losses !== 'string') {
      return losses;
    }
    return JSON.parse(losses);
  }, [losses]);
  const { total, units = EMPTY_UNITS } = parsed;

  if (total === 0 || units.length === 0) {
    return <span>0 Units</span>;
  }

  const consolidatedUnits = units.reduce(
    (acc, unit) => {
      const key = `${unit.level}-${unit.type}`;
      if (!acc[key]) {
        acc[key] = { ...unit };
      } else {
        acc[key].quantity += unit.quantity;
      }
      return acc;
    },
    {} as Record<string, BattleUnits>,
  );

  return (
    <HoverCard>
      <HoverCard.Target>
        <span>{total} Units</span>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <List>
          {Object.values(consolidatedUnits).map((unit, index) => (
            <List.Item key={index}>
              {unit.quantity}x Level {unit.level} {unit.type}
            </List.Item>
          ))}
        </List>
      </HoverCard.Dropdown>
    </HoverCard>
  );
};

export default LossesList;
