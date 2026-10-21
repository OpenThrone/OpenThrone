import { Badge, Box, Group, Text } from '@mantine/core';
import React from 'react';

import classes from '@/components/game/Panels.module.css';

import { GameCard } from './GameCard';

interface StyledContentProps {
  title: string;
  content: string;
  badgeText?: string;
}

/** Styled content. */
export const StyledContent: React.FC<StyledContentProps> = ({
  title,
  content,
  badgeText,
}) => {
  return (
    <GameCard title={title}>
      <Box p="md" className={classes.insetRow}>
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={700} c="gray.2">
            {title}
          </Text>
          {badgeText && (
            <Badge size="xs" variant="outline" color="yellow">
              {badgeText}
            </Badge>
          )}
        </Group>
        <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
          {content}
        </Text>
      </Box>
    </GameCard>
  );
};
