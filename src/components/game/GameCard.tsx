import React from 'react';
import { Box, Paper, Text, Group, PaperProps, rem } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

interface GameCardProps extends PaperProps {
  title: string;
  icon?: IconDefinition;
  children: React.ReactNode;
  action?: React.ReactNode;
  goldAccent?: boolean; // If true, adds the gold glow/border
}

export const GameCard: React.FC<GameCardProps> = ({
  title,
  icon,
  children,
  action,
  goldAccent = true,
  style,
  ...others
}) => {
  return (
    <Paper
      radius="sm"
      style={{
        backgroundColor: '#131b29', // Deep Navy Base
        border: '1px solid #2f3e52',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
      {...others}
    >
      {/* HEADER: Beveled Gradient + Gold Border */}
      <Box
        py="sm"
        px="lg"
        style={{
          background: 'linear-gradient(180deg, #253346 0%, #1a2533 100%)',
          borderBottom: goldAccent ? '2px solid #e5c55a' : '1px solid #2f3e52',
          borderTop: '1px solid rgba(255,255,255,0.1)', // Highlight for 3D effect
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <Group gap="xs">
          {icon && (
            <FontAwesomeIcon
              icon={icon}
              style={{ color: goldAccent ? '#e5c55a' : '#9ca3af', fontSize: '14px' }}
            />
          )}
          <Text
            style={{
              fontFamily: 'MedievalSharp, serif', // Matches your theme
              color: goldAccent ? '#e5c55a' : '#e5e7eb',
              fontWeight: 700,
              letterSpacing: '1px',
              fontSize: rem(18),
              textShadow: '0 2px 4px rgba(0,0,0,0.8)',
              textTransform: 'uppercase',
            }}
          >
            {title}
          </Text>
        </Group>

        {action && <Box>{action}</Box>}
      </Box>

      {/* BODY */}
      <Box p="md" style={{ flexGrow: 1, position: 'relative' }}>
        {/* Optional: Subtle noise or vignette overlay could go here */}
        {children}
      </Box>
    </Paper>
  );
};