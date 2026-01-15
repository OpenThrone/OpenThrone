import { Box, Group, Progress, Table, Text } from '@mantine/core';
import React from 'react';

import { GameCard } from './GameCard';

// Assuming LossesList is the component you have, or we render the raw data logic here
// For this demo, I'll recreate the visual logic to match the theme.
interface StyledLossesProps {
  losses: string; // JSON string
}

export const StyledLosses: React.FC<StyledLossesProps> = ({ losses }) => {
  const data = JSON.parse(losses);

  return (
    <GameCard title="Battle Casualties">
      <Box
        p="md"
        style={{
          backgroundColor: '#0f141a', // Slot bg
          border: '1px solid #1f2b3b', // Slot border
          borderRadius: '6px',
          boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
        }}
      >
        <Group justify="space-between" mb="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Total Lost
          </Text>
          <Text
            size="lg"
            fw={900}
            c="red.4"
            style={{ fontFamily: 'monospace' }}
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
