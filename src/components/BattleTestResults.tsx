import React from 'react';
import { Badge, Grid, Group, Progress, Table, Text } from '@mantine/core';
import { Fortifications } from '@/constants';
import { PlayerUnit } from '@/types/typings';
import { GameCard } from './game/GameCard';
import { StyledTable } from './game/StyledTable';
import { faShieldAlt, faScroll, faCrown } from '@fortawesome/free-solid-svg-icons';

interface BattleResultsProps {
  results: any;
  attackerStats: any;
  defenderStats: any;
}

const BattleResults: React.FC<BattleResultsProps> = ({ results, attackerStats, defenderStats }) => {
  if (!results || !attackerStats || !defenderStats) {
    return (
      <GameCard title="Battle Results"><Text>Incomplete battle data. Please try again.</Text></GameCard>
    );
  }

  const defenderFort = Fortifications[results.defender.fortLevel];
  const getTotalUnits = (unitTotals: any): number => {
    if (!unitTotals) return 0;
    if (typeof unitTotals === 'object' && !Array.isArray(unitTotals)) {
      let total = 0;
      for (const value of Object.values(unitTotals)) {
        if (typeof value === 'number') total += value;
        else if (typeof value === 'string' && !isNaN(Number(value))) total += Number(value);
      }
      return total;
    }
    return 0;
  };
  
  const attackerTotalUnits = getTotalUnits(attackerStats.unitTotals);
  const defenderTotalUnits = getTotalUnits(defenderStats.unitTotals);
  const winner = results.result === "WIN" ? "Attacker Won" : "Defender Won";

  const renderUnitLosses = (losses: PlayerUnit[]) => {
    const sortedUnits = [...losses].sort((a, b) => a.type.localeCompare(b.type) || a.level - b.level);
    if (sortedUnits.length === 0) {
      return <Table.Tr><Table.Td colSpan={2} style={{ textAlign: 'center' }}>No losses</Table.Td></Table.Tr>;
    }
    return sortedUnits.map(({ type, level, quantity }) => (
      <Table.Tr key={`${type}-${level}`}><Table.Td>{type} (Lvl {level})</Table.Td><Table.Td>{quantity.toLocaleString()}</Table.Td></Table.Tr>
    ));
  };

  return (
    <GameCard title="Battle Results" icon={faCrown}>
      <Group justify="center" mb="md">
        <Badge size="xl" color={results.result === "WIN" ? "green" : "red"}>{winner}</Badge>
      </Group>
      <Grid gutter="md">
        <Grid.Col span={{base: 12, md: 6}}>
          <GameCard title="Attacker" goldAccent={results.result === "WIN"}>
            <Text>Attack Power: {attackerStats.attackPower.toLocaleString()}</Text>
            <Text>Defense Power: {attackerStats.defensePower.toLocaleString()}</Text>
            <Text>Total Units: {attackerTotalUnits.toLocaleString()}</Text>
            <Text fw={700} c="red">Losses: {results.Losses.Attacker.total.toLocaleString()} units</Text>
            <Progress value={(results.Losses.Attacker.total / attackerTotalUnits) * 100} color="red" size="lg" striped animated />
            <StyledTable headers={['Unit', 'Losses']}>{renderUnitLosses(results.Losses.Attacker.units)}</StyledTable>
          </GameCard>
        </Grid.Col>
        <Grid.Col span={{base: 12, md: 6}}>
          <GameCard title="Defender" goldAccent={results.result !== "WIN"}>
            <Text>Attack Power: {defenderStats.attackPower.toLocaleString()}</Text>
            <Text>Defense Power: {defenderStats.defensePower.toLocaleString()}</Text>
            <Text>Total Units: {defenderTotalUnits.toLocaleString()}</Text>
            <Text fw={700} c="red">Losses: {results.Losses.Defender.total.toLocaleString()} units</Text>
            <Progress value={(results.Losses.Defender.total / defenderTotalUnits) * 100} color="red" size="lg" striped animated />
            <StyledTable headers={['Unit', 'Losses']}>{renderUnitLosses(results.Losses.Defender.units)}</StyledTable>
          </GameCard>
        </Grid.Col>
        <Grid.Col span={12}>
          <GameCard title="Fort Status" icon={faShieldAlt}>
            <Text>Fort Level: {results.defender.fortLevel}</Text>
            <Text>HP: {results.finalFortHP.toLocaleString()} / {defenderFort.hitpoints.toLocaleString()}</Text>
            <Progress
              value={(results.finalFortHP / defenderFort.hitpoints) * 100}
              color={results.finalFortHP < defenderFort.hitpoints / 2 ? "red" : "blue"}
              size="lg" striped animated
            />
          </GameCard>
        </Grid.Col>
        <Grid.Col span={12}>
          <GameCard title="Battle Log" icon={faScroll}>
            <Text>Turns: {results.turnsTaken}</Text>
            {results.log && <pre style={{ whiteSpace: 'pre-wrap', margin: 0, maxHeight: 300, overflow: 'auto' }}>{results.log}</pre>}
          </GameCard>
        </Grid.Col>
      </Grid>
    </GameCard>
  );
};

export default BattleResults;
