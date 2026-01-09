import React, { useState } from 'react';
import { Box, Group, Text, Button, NumberInput, Grid, useMantineTheme } from '@mantine/core';
import { GameCard } from './GameCard';
import { faHammer } from '@fortawesome/free-solid-svg-icons';
import RpgAwesomeIcon from '../RpgAwesomeIcon';

// Mock data structure matching your potential unit types
const UNITS = [
  { id: 'u1', name: 'Soldier', icon: 'sword', cost: 100, owned: 450 },
  { id: 'u2', name: 'Archer', icon: 'archery-target', cost: 150, owned: 120 },
  { id: 'u3', name: 'Spy', icon: 'hood', cost: 300, owned: 15 },
];

export const UnitTrainingPanel = () => {
  const theme = useMantineTheme();
  const secondary = theme.colors.secondary ?? theme.colors.yellow;
  const accent = secondary[4] ?? '#e5c55a';
  const accentDark = secondary[6] ?? accent;

  return (
    <GameCard title="Training Grounds" icon={faHammer}>
      <Grid gutter="md">
        {UNITS.map((unit) => (
          <Grid.Col span={{ base: 12 }} key={unit.id}>
            <TrainingSlot unit={unit} />
          </Grid.Col>
        ))}
      </Grid>

      {/* Total Footer */}
      <Box mt="lg" style={{ borderTop: '1px dashed #2f3e52', paddingTop: '16px' }}>
        <Group justify="flex-end">
          <Button
            variant="filled"
            color="yellow"
            size="md"
            style={{
              background: `linear-gradient(180deg, ${accent} 0%, ${accentDark} 100%)`,
              color: '#000',
              border: `1px solid ${accent}`,
              boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
            }}
          >
            TRAIN ALL UNITS
          </Button>
        </Group>
      </Box>
    </GameCard>
  );
};

const TrainingSlot = ({ unit }: { unit: any }) => {
  const [value, setValue] = useState<string | number>('');
  const theme = useMantineTheme();
  const brand = theme.colors.brand ?? theme.colors.blue;
  const secondary = theme.colors.secondary ?? theme.colors.yellow;
  const accent = secondary[4] ?? '#e5c55a';

  return (
    <Box
      style={{
        backgroundColor: '#0f141a', // Darker slot background
        borderRadius: '6px',
        border: '1px solid #1f2b3b',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)', // INSET SHADOW creates the "Slot" depth
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Left: Unit Info */}
      <Group>
        <Box
          style={{
            width: 48,
            height: 48,
            background: '#1a1f26',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #333',
            borderRadius: '4px'
          }}
        >
          <RpgAwesomeIcon icon={unit.icon} size="2x" color={brand[3] ?? '#6b7280'} />
        </Box>
        <Box>
          <Text fw={700} c="gray.3" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {unit.name}
          </Text>
          <Group gap={6}>
            <Text size="xs" c="dimmed">Cost: <span style={{ color: accent }}>{unit.cost}</span></Text>
            <Text size="xs" c="dimmed">|</Text>
            <Text size="xs" c="dimmed">Owned: {unit.owned}</Text>
          </Group>
        </Box>
      </Group>

      {/* Right: Input & Action */}
      <Group gap="xs">
        <NumberInput
          value={value}
          onChange={setValue}
          placeholder="0"
          min={0}
          styles={{
            input: {
              backgroundColor: '#0b1016',
              border: '1px solid #2f3e52',
              color: accent, // Accent text for inputs
              fontFamily: 'monospace',
              fontWeight: 700,
              width: '80px',
              textAlign: 'center',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)', // Deep input feel
            },
          }}
        />
        <Button
          size="xs"
          variant="default"
          style={{
            backgroundColor: '#1f2b3b',
            borderColor: '#2f3e52',
            color: '#9ca3af',
            boxShadow: '0 2px 0 #0f151c', // Physical button click feel
          }}
        >
          MAX
        </Button>
      </Group>
    </Box>
  );
};
