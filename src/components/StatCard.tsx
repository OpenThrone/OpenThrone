import { Box, Group, Paper, Text, ThemeIcon } from '@mantine/core';
import Link from 'next/link';
import type React from 'react';

import classes from '@/components/game/Panels.module.css';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: 'default' | 'highlight' | 'pulse';
  subtext?: string;
  iconPosition?: 'left' | 'right';
  href?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  variant = 'default',
  subtext,
  iconPosition = 'right',
  href,
}) => {
  const iconNode = (
    <ThemeIcon
      c="var(--ot-brand-text)"
      variant="transparent"
      aria-hidden="true"
    >
      {icon}
    </ThemeIcon>
  );

  const card = (
    <Paper
      withBorder
      radius="sm"
      p={0}
      style={{
        borderColor: variant !== 'default' ? 'var(--ot-accent)' : undefined,
        cursor: href ? 'pointer' : undefined,
        transition: href
          ? 'transform 0.15s ease, box-shadow 0.15s ease'
          : undefined,
      }}
      className={`${classes.card} ${variant !== 'default' ? classes.highlight : ''}`}
    >
      <Group className={classes.header} wrap="nowrap">
        {iconPosition === 'left' && iconNode}
        <Text component="h2" size="md" className={classes.title}>
          {title}
        </Text>
        {iconPosition === 'right' && iconNode}
      </Group>
      <Box className={classes.statBody}>
        <Text size="xl" fw={700} className={classes.statValue}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </Text>
        {subtext && (
          <Text size="sm" c="dimmed" mt="xs">
            {subtext}
          </Text>
        )}
      </Box>
    </Paper>
  );

  if (href) {
    return (
      <Link
        href={href}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        {card}
      </Link>
    );
  }

  return card;
};

export default StatCard;
