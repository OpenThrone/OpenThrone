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
          backgroundColor: '#0f141a',
          borderLeft: '4px solid #e5c55a', // The "Highlight" is now a Gold strip
          borderRadius: '0 4px 4px 0',
          boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
        }}
      >
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={700} c="gray.2">
            Treasury Ledger
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
