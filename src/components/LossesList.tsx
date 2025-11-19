import { BattleUnits } from "@/types/typings";
import { HoverCard, List } from "@mantine/core";
import { Record } from "@prisma/client/runtime/library";

interface LossesListProps {
  losses: string; // JSON string containing total and units
}
const LossesList: React.FC<LossesListProps> = ({ losses }) => {
  const parsed: { total: number; units: BattleUnits[] } =
    typeof losses === 'string' ? (JSON.parse(losses) as { total: number; units: BattleUnits[] }) : (losses as { total: number; units: BattleUnits[] });
  const { total, units = [] } = parsed;

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