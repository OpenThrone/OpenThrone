import { Badge, Box, Group, Text } from '@mantine/core';
import React from 'react';

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
      <Box
        p="md"
        style={{
          backgroundColor: 'var(--ot-inset)',
          border: '1px solid var(--ot-line)',
          borderRadius: 'var(--mantine-radius-sm)',
          boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
        }}
      >
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
