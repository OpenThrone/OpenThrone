import React from 'react';
import {
  Paper,
  Title,
  Text,
  Table,
  Progress,
  Stack,
  Grid,
  Group,
  Badge,
  Card,
} from '@mantine/core';
import { Fortifications } from '@/constants';
import { count } from 'console';
import { PlayerUnit } from '@/types/typings';

interface BattleResultsProps {
  results: any;
  attackerStats: any;
  defenderStats: any;
}

const BattleResults: React.FC<BattleResultsProps> = ({ results, attackerStats, defenderStats }) => {
  if (!results || !attackerStats || !defenderStats) {
    return (
      <Paper p="md" withBorder>
        <Title order={3} mb="md">Battle Results</Title>
        <Text>Incomplete battle data. Please try running the simulation again.</Text>
      </Paper>
    );
  }

  const defenderFort = Fortifications[results.defender.fortLevel];

  const getTotalUnits = (unitTotals: any) => {
    if (!unitTotals) return 0;
    
    // Check if it's a flat structure (direct key-value pairs)
    if (typeof unitTotals === 'object' && !Array.isArray(unitTotals)) {
      // For flat structure like {citizens: 0, workers: 0, offense: 100, ...}
      let total = 0;
      
      for (const [key, value] of Object.entries(unitTotals)) {
        // Skip non-numeric properties
        if (typeof value === 'number') {
          total += value;
        } else if (typeof value === 'string' && !isNaN(Number(value))) {
          total += Number(value);
        }
      }
      
      return total;
    }
    
    // Original nested structure handling
    return Object.keys(unitTotals).reduce((sum: number, type: string) => {
      if (!unitTotals[type]) return sum;
      
      // Handle if the value is already a number
      if (typeof unitTotals[type] === 'number') {
        return sum + unitTotals[type];
      }
      
      // Handle nested structure
      const typeTotal = Object.values(unitTotals[type]).reduce((a: number, b: any) => {
        const bValue = typeof b === 'number' ? b : (Number(b) || 0);
        return a + bValue;
      }, 0);
      
      return sum + (typeof typeTotal === 'number' ? typeTotal : 0);
    }, 0);
  };

  console.log('Attacker Unit Totals:', getTotalUnits(attackerStats.unitTotals));
  const attackerTotalUnits = getTotalUnits(attackerStats.unitTotals);
  const defenderTotalUnits = getTotalUnits(defenderStats.unitTotals);

  // Determine winner
  let winner = results.result === "WIN" ? "You Won" : "You Lost";

  return (
    <Paper p="md" withBorder>
      <Title order={3} mb="md">Battle Results</Title>

      <Grid mb="lg">
        <Grid.Col span={12}>
          <Group gap="center" mb="md">
            <Badge size="xl" color={results.result === "WIN" ? "green" : results.result === "LOSS" ? "red" : "gray"}>
              {winner}
            </Badge>
          </Group>
        </Grid.Col>

        <Grid.Col span={6}>
          <Card withBorder p="md">
            <Title order={4}>Attacker</Title>
            <Text>Attack Power: {attackerStats.attackPower}</Text>
            <Text>Defense Power: {attackerStats.defensePower}</Text>
            {attackerStats.itemBonuses && (
              <Text size="sm" c="dimmed">
                Item Bonuses: +{attackerStats.itemBonuses.offense || 0}% offense,
                +{attackerStats.itemBonuses.defense || 0}% defense
              </Text>
            )}
            <Text>Total Units: {attackerTotalUnits}</Text>
            <Text fw={700} color="red">Losses: {results.Losses.Attacker.total} units</Text>
            <Stack gap="xs">
              <Progress
                value={results.Losses.Attacker.total / attackerTotalUnits * 100}
                color="red"
                size="lg"
                mb="md"
              />
              <Text size="sm" ta="center">{`${(results.Losses.Attacker.total / attackerTotalUnits * 100).toFixed(1)}%`}</Text>
            </Stack>

            <Title order={5} mt="md">Unit Losses</Title>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Unit Type</Table.Th>
                  <Table.Th>Losses</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(() => {
                  // Group and sum units by type and level
                  const groupedUnits = results.Losses.Attacker.units.reduce((acc, { type, level, quantity }) => {
                    const key = `${type}-${level}`;
                    if (!acc[key]) {
                      acc[key] = { type, level, quantity };
                    } else {
                      acc[key].quantity += quantity;
                    }
                    return acc;
                  }, {} as Record<string, PlayerUnit>);
``
                  // Convert to array for rendering
                  const sortedUnits: PlayerUnit[] = Object.values(groupedUnits) as PlayerUnit[]
                    sortedUnits.sort((a, b) => a.type === b.type ? a.level - b.level : a.type.localeCompare(b.type));
                  console.log('Attacker sortedUnits:', sortedUnits);
                  return sortedUnits.length > 0 ? (
                    sortedUnits.map(({ type, level, quantity }) => (
                      <Table.Tr key={`${type}-${level}`}>
                        <Table.Td>{type} (Level {level})</Table.Td>
                        <Table.Td>{quantity.toLocaleString()}</Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={2} style={{ textAlign: 'center' }}>No losses</Table.Td>
                    </Table.Tr>
                  );
                })()}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>

        <Grid.Col span={6}>
          <Card withBorder p="md">
            <Title order={4}>Defender</Title>
            <Text>Attack Power: {defenderStats.attackPower}</Text>
            <Text>Defense Power: {defenderStats.defensePower}</Text>
            <Stack gap="xs">
              <Progress
                value={results.Losses.Defender.total / defenderTotalUnits * 100}
                color="red"
                size="lg"
                mb="md"
              />
              <Text size="sm" ta="center">{`${(results.Losses.Defender.total / defenderTotalUnits * 100).toFixed(1)}%`}</Text>
            </Stack>

            <Title order={5} mt="md">Unit Losses</Title>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Unit Type</Table.Th>
                  <Table.Th>Losses</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(() => {
                  // Group and sum units by type and level
                  const groupedUnits = results.Losses.Defender.units.reduce((acc, { type, level, quantity }) => {
                    const key = `${type}-${level}`;
                    if (!acc[key]) {
                      acc[key] = { type, level, quantity };
                    } else {
                      acc[key].quantity += quantity;
                    }
                    return acc;
                  }, {} as Record<string, PlayerUnit>);
                  // Convert to array for rendering
                  const sortedUnits: PlayerUnit[] = Object.values(groupedUnits) as PlayerUnit[]
                    sortedUnits.sort((a, b) => a.type === b.type ? a.level - b.level : a.type.localeCompare(b.type));
                  console.log('Defender sortedUnits:', sortedUnits);
                  return sortedUnits.length > 0 ? (
                    sortedUnits.map(({ type, level, quantity }) => (
                      <Table.Tr key={`${type}-${level}`}>
                        <Table.Td>{type} (Level {level})</Table.Td>
                        <Table.Td>{quantity.toLocaleString()}</Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={2} style={{ textAlign: 'center' }}>No losses</Table.Td>
                    </Table.Tr>
                  );
                })()}
                
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
      </Grid>

      <Card withBorder p="md" mb="md">
        <Title order={4}>Fort Status</Title>
        <Text>Fort Level: {results.defender.fortLevel}</Text>
        <Text>Fort Hitpoints: {results.finalFortHP} / {defenderFort.hitpoints}</Text>
        
        <Stack gap="xs">
          <Progress
            value={(results.finalFortHP / defenderFort.hitpoints) * 100}
            color={results.finalFortHP < defenderFort.hitpoints / 2 ? "red" : "blue"}
            size="lg"
          />
          <Text size="sm" ta="center">{`${((results.finalFortHP / defenderFort.hitpoints) * 100).toFixed(1)}%`}</Text>
        </Stack>
        <Text mt="xs" c="dimmed">
          {results.finalFortHP === 0 ?
            "Fort completely destroyed!" :
            results.finalFortHP < defenderFort.hitpoints * .3 ?
              "Fort severely damaged!" :
              results.finalFortHP < defenderFort.hitpoints * .75 ?
                "Fort damaged" :
                "Fort largely intact"
          }
        </Text>
      </Card>

      <Card withBorder p="md">
        <Title order={4}>Battle Details</Title>
        <Text>Turns simulated: {results.turnsTaken || 123456}</Text>
        {results.log && (
          <Paper withBorder p="sm" mt="md" style={{ maxHeight: '200px', overflow: 'auto' }}>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{results.log}</pre>
          </Paper>
        )}
      </Card>
    </Paper>
  );
};

export default BattleResults;