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
      <SimpleGrid cols={{ base: 1, sm: columns }} spacing="sm" data-testid="stat-grid">
        {stats.map((stat, index) => (
          <Box
            key={index}
            data-testid="stat-slot"
            className="rpg-inset"
            p="sm"
            style={{
              borderRadius: '6px',
              border: '1px solid #1f2b3b', // Slot Border
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 0,
                background: `
      radial-gradient(circle at 92% 50%, ${accent}45 0%, transparent 55%),
      linear-gradient(to left, ${accent}10 0%, transparent 35%)
    `,
                opacity: 1,
              }}
            />
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
                <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ letterSpacing: '0.5px' }} data-testid="stat-label">
                  {stat.label}
                </Text>
              </div>
            </Group>

            <Text
              size="lg"
              fw={900}
              data-testid="stat-value"
              className={stat.isPositive !== false ? 'text-rpg-gold' : ''}
              style={{
                fontFamily: 'monospace', // Monospace for numbers (very RPG)
                zIndex: 1,
                color: stat.isPositive === false ? '#ef4444' : undefined,
                textShadow: stat.isPositive === false ? '0 0 5px rgba(239, 68, 68, 0.6)' : '0 0 10px rgba(229, 197, 90, 0.1)',
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
