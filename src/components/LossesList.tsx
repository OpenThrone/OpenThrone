import { BattleUnits, Loss } from "@/types/typings";
import { HoverCard, List } from "@mantine/core";

interface LossesListProps {
  losses: Loss;
}
const LossesList: React.FC<LossesListProps> = ({ losses }) => {
  const { total, units = [] } = losses;

  if (total === 0 || units.length === 0) {
    return <span>0 Units</span>;
  }

  const consolidatedUnits = units.reduce((acc, unit) => {
    const key = `${unit.level}-${unit.type}`;
    if (!acc[key]) {
      acc[key] = { ...unit };
    } else {
      acc[key].quantity += unit.quantity;
    }
    return acc;
  }, {} as Record<string, BattleUnits>);

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