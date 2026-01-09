import React from 'react';
import { Box, Group, Text, SimpleGrid, useMantineTheme } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { GameCard } from './GameCard';

interface StatItem {
  label: string;
  value: string | number;
  icon?: React.ReactNode | IconDefinition;
  isPositive?: boolean;
}

interface StatGridProps {
  title: string;
  stats: StatItem[];
  columns?: number;
}

export const StatGrid: React.FC<StatGridProps> = ({
  title,
  stats,
  columns = 2,
}) => {
  const theme = useMantineTheme();
  const secondary = theme.colors.secondary ?? theme.colors.yellow;
  const accent = secondary[4] ?? '#e5c55a';
  const isIconDefinition = (icon: StatItem['icon']): icon is IconDefinition =>
    Boolean(icon && typeof icon === 'object' && 'iconName' in icon);

  return (
    <GameCard title={title}>
      <SimpleGrid cols={{ base: 1, sm: columns }} spacing="sm">
        {stats.map((stat, index) => (
          <Box
            key={index}
            p="sm"
            style={{
              backgroundColor: '#0f141a', // Slot Background
              borderRadius: '6px',
              border: '1px solid #1f2b3b', // Slot Border
              boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)', // The "Pressed In" look
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Group gap="sm">
              {stat.icon && (
                <div
                  style={{
                    color: '#6b7280', // Dimmed icon
                    fontSize: '1.2rem',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {isIconDefinition(stat.icon)
                    ? <FontAwesomeIcon icon={stat.icon} />
                    : stat.icon}
                </div>
              )}
              <div>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ letterSpacing: '0.5px' }}>
                  {stat.label}
                </Text>
              </div>
            </Group>

            <Text
              size="lg"
              fw={900}
              style={{
                fontFamily: 'monospace', // Monospace for numbers (very RPG)
                color: stat.isPositive ? accent : '#e5e7eb',
                textShadow: '0 0 10px rgba(229, 197, 90, 0.1)',
              }}
            >
              {stat.value}
            </Text>
          </Box>
        ))}
      </SimpleGrid>
    </GameCard>
  );
};

export default StatGrid;
