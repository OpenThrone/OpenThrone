import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Box, Group, SimpleGrid, Text, Tooltip } from '@mantine/core';
import React from 'react';

import classes from '@/components/game/Panels.module.css';

import { GameCard, type GameCardProps } from './GameCard';

interface StatItem {
  label: string;
  value: string | number | React.ReactNode;
  icon?: React.ReactNode | IconDefinition;
  isPositive?: boolean;
  /** Optional tooltip rendered over the stat slot. */
  tooltip?: string;
  /** Qualifying condition rendered as a visible sub-label on touch viewports. */
  qualifier?: string;
}

type StatGridCols = React.ComponentProps<typeof SimpleGrid>['cols'];

interface StatGridProps {
  title: string;
  /** Optional heading icon, forwarded to the GameCard header. */
  icon?: GameCardProps['icon'];
  stats: StatItem[];
  columns?: number;
  /** Overrides the responsive column defaults, e.g. `{{ base: 2, sm: 2 }}`. */
  cols?: StatGridCols;
  /** Optional header action forwarded to the GameCard header. */
  action?: GameCardProps['action'];
}

/** Stat grid. */
export const StatGrid: React.FC<StatGridProps> = ({
  title,
  icon,
  stats,
  columns = 2,
  cols,
  action,
}) => {
  const isIconDefinition = (icon: StatItem['icon']): icon is IconDefinition =>
    Boolean(icon && typeof icon === 'object' && 'iconName' in icon);

  return (
    <GameCard title={title} icon={icon} action={action}>
      <SimpleGrid
        cols={cols ?? { base: columns >= 4 ? 2 : 1, sm: columns }}
        spacing="sm"
        data-testid="stat-grid"
      >
        {stats.map((stat, index) => {
          const slot = (
            <Box
              key={index}
              data-testid="stat-slot"
              className={classes.slot}
              tabIndex={stat.tooltip ? 0 : undefined}
              aria-label={stat.tooltip}
            >
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                {stat.icon && (
                  <div
                    style={{
                      color: 'var(--ot-brand-text)',
                      fontSize: '1.2rem',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {isIconDefinition(stat.icon) ? (
                      <FontAwesomeIcon icon={stat.icon} />
                    ) : (
                      stat.icon
                    )}
                  </div>
                )}
                <div>
                  <Text
                    size="xs"
                    c="dimmed"
                    fw={700}
                    tt="uppercase"
                    style={{ letterSpacing: '0.5px' }}
                    data-testid="stat-label"
                  >
                    {stat.label}
                  </Text>
                </div>
              </Group>

              <div style={{ minWidth: 0 }}>
                <Text
                  size="lg"
                  fw={700}
                  data-testid="stat-value"
                  className={classes.statValue}
                  c={stat.isPositive === false ? 'red.3' : 'var(--ot-heading)'}
                >
                  {stat.value}
                </Text>
                {stat.qualifier && (
                  <Text
                    size="xs"
                    c="dimmed"
                    className={classes.statQualifier}
                    data-testid="stat-qualifier"
                  >
                    {stat.qualifier}
                  </Text>
                )}
              </div>
            </Box>
          );

          return stat.tooltip ? (
            <Tooltip key={index} label={stat.tooltip} withArrow>
              {slot}
            </Tooltip>
          ) : (
            slot
          );
        })}
      </SimpleGrid>
    </GameCard>
  );
};
