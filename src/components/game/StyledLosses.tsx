import { Box, Group, Progress, Table, Text } from '@mantine/core';
import React, { useMemo } from 'react';

import classes from '@/components/game/Panels.module.css';

import { GameCard } from './GameCard';

interface StyledLossesProps {
  losses: string; // JSON string
}

/** Styled losses. */
export const StyledLosses: React.FC<StyledLossesProps> = ({ losses }) => {
  const data = useMemo(() => JSON.parse(losses), [losses]);

  return (
    <GameCard title="Battle Casualties">
      <Box p="md" className={classes.insetRow}>
        <Group justify="space-between" mb="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Total Lost
          </Text>
          <Text
            size="lg"
            fw={900}
            c="red.4"
            style={{
              fontFamily: 'var(--mantine-font-family)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {data.total}
          </Text>
        </Group>

        <Table>
          <Table.Tbody>
            {data.units.map((unit: any, idx: number) => (
              <Table.Tr key={idx}>
                <Table.Td style={{ border: 'none', width: '50%' }}>
                  <Text size="sm" c="gray.2">
                    Lvl {unit.level} {unit.type}
                  </Text>
                </Table.Td>
                <Table.Td style={{ border: 'none', width: '50%' }}>
                  <Progress
                    value={100} // Just a visual bar for now
                    color="red"
                    size="xs"
                  />
                  <Text size="xs" c="dimmed" ta="right" mt={2}>
                    {unit.quantity}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </GameCard>
  );
};
