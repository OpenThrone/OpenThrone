import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { PaperProps } from '@mantine/core';
import { Box, Group, Paper, Text } from '@mantine/core';
import type React from 'react';

import frameClasses from '@/components/game/FantasyFrame.module.css';
import classes from '@/components/game/Panels.module.css';

export interface GameCardProps extends PaperProps {
  title: string;
  icon?: IconDefinition | React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  goldAccent?: boolean; // Emphasizes the header and frame with the theme accent.
}

/** A single, race-aware frame for game content and its header actions. */
export const GameCard: React.FC<GameCardProps> = ({
  title,
  icon,
  children,
  action,
  goldAccent = true,
  style,
  className,
  m,
  mx,
  my,
  mt,
  mb,
  ml,
  mr,
  ...others
}) => {
  const isIconDefinition = (
    value: GameCardProps['icon'],
  ): value is IconDefinition =>
    Boolean(value && typeof value === 'object' && 'iconName' in value);

  return (
    <Box
      className={classes.frame}
      m={m}
      mx={mx}
      my={my}
      mt={mt}
      mb={mb}
      ml={ml}
      mr={mr}
    >
      <Paper
        radius="sm"
        className={[
          classes.card,
          frameClasses.surface,
          goldAccent ? frameClasses.ornate : '',
          'game-card',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid="game-card"
        style={{
          background: 'var(--ot-panel)',
          border: `1px solid ${goldAccent ? 'var(--frame-edge)' : 'var(--ot-line)'}`,
          boxShadow: 'var(--frame-shadow)',
          ...style,
        }}
        {...others}
      >
        <Box
          className={`${classes.header} ${goldAccent ? classes.accentHeader : ''}`}
          data-testid="game-card-header"
        >
          <Group gap="md" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            {icon && (
              <Box
                c="var(--ot-accent)"
                className={classes.headingIcon}
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                {isIconDefinition(icon) ? (
                  <FontAwesomeIcon icon={icon} />
                ) : (
                  icon
                )}
              </Box>
            )}
            <Text
              component="h2"
              size="lg"
              className={`${classes.title} ${classes.cardTitle}`}
              data-testid="card-title"
            >
              {title}
            </Text>
          </Group>
          {action && <Box>{action}</Box>}
        </Box>
        <Box className={classes.content} data-testid="card-content">
          {children}
        </Box>
      </Paper>
    </Box>
  );
};
