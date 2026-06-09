import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { PaperProps } from '@mantine/core';
import { Box, Group, Paper, rem, Text, useMantineTheme } from '@mantine/core';
import React, { useEffect } from 'react';

import { useUser } from '@/context/users';

const CornerDecor: React.FC<{ rotation: number; color: string }> = ({
  rotation,
  color,
}) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 15 15"
    aria-hidden
    shapeRendering="crispEdges"
    style={{
      position: 'absolute',
      transform: `rotate(${rotation}deg)`,
      zIndex: 10,
      pointerEvents: 'none',
    }}
  >
    <path d="M0 0H15V2H2V15H0Z" fill={color} />
    <rect x="2" y="2" width="2" height="2" fill={color} opacity={0.5} />
  </svg>
);

interface GameCardProps extends PaperProps {
  title: string;
  icon?: IconDefinition | React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  goldAccent?: boolean; // If true, adds the gold glow/border
}

/** Game card. */
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
  const theme = useMantineTheme();
  const brand = theme.colors.brand ?? theme.colors.blue;
  const [accent, setAccent] = React.useState<string>(
    theme.colors.secondary[5] ?? '#e5c55a',
  );
  const { user } = useUser();
  const [colorScheme, setColorScheme] = React.useState('ELF');
  const headerAccentByRace: Record<string, string> = {
    ELF: 'rgb(34, 139, 34)',
    GOBLIN: 'rgb(139, 69, 19)',
    HUMAN: 'rgb(70, 130, 180)',
    UNDEAD: 'rgb(64, 64, 64)',
  };
  useEffect(() => {
    if (!user) return;
    const storedRace =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('userRace')
        : null;
    const nextScheme = storedRace || user?.colorScheme || 'ELF';
    setColorScheme(nextScheme);
    setAccent(
      nextScheme === 'UNDEAD'
        ? theme.colors.secondary[2]
        : (theme.colors.secondary[5] ?? '#e5c55a'),
    );
  }, [user, colorScheme, theme.colors.secondary, accent]);
  const headerAccent = headerAccentByRace[colorScheme] ?? accent;

  const isIconDefinition = (
    value: GameCardProps['icon'],
  ): value is IconDefinition =>
    Boolean(value && typeof value === 'object' && 'iconName' in value);

  return (
    <Box
      style={{ position: 'relative', height: '100%' }}
      m={m}
      mx={mx}
      my={my}
      mt={mt}
      mb={mb}
      ml={ml}
      mr={mr}
    >
      <div style={{ position: 'absolute', top: 1, left: 1 }}>
        <CornerDecor rotation={0} color={accent} />
      </div>
      <div style={{ position: 'absolute', top: 1, right: 15 }}>
        <CornerDecor rotation={90} color={accent} />
      </div>
      <div style={{ position: 'absolute', bottom: 15, right: 15 }}>
        <CornerDecor rotation={180} color={accent} />
      </div>
      <div style={{ position: 'absolute', bottom: 15, left: 1 }}>
        <CornerDecor rotation={270} color={accent} />
      </div>

      <Paper
        radius="xs"
        className={['bg-rpg-panel', 'game-card', 'public-rise', className]
          .filter(Boolean)
          .join(' ')}
        data-testid="game-card"
        style={{
          border: `1px solid ${goldAccent ? 'rgba(255,255,255,0.08)' : '#2f3e52'}`,
          boxShadow:
            '0 15px 30px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          backgroundImage:
            'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.65) 60%), linear-gradient(180deg, rgba(33,47,66,0.8), rgba(7,9,12,0.95))',
          ...style,
        }}
        {...others}
      >
        <Box
          py="sm"
          px="lg"
          data-testid="game-card-header"
          style={{
            position: 'relative',
            background: `linear-gradient(180deg, rgba(37, 51, 70, 0.85), rgba(15, 21, 29, 0.9)), linear-gradient(90deg, ${headerAccent} 0%, transparent 70%)`,
            borderBottom: goldAccent
              ? `2px solid ${accent}`
              : '1px solid rgba(255,255,255,0.1)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: '8%',
              right: '8%',
              height: '1px',
              background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
              opacity: 0.65,
            }}
          />

          <Group gap="xs">
            {icon &&
              (isIconDefinition(icon) ? (
                <FontAwesomeIcon
                  icon={icon}
                  style={{
                    color: goldAccent ? accent : brand[2],
                    fontSize: '14px',
                  }}
                />
              ) : (
                <Box
                  style={{
                    color: goldAccent ? accent : brand[2],
                    fontSize: '14px',
                  }}
                >
                  {icon}
                </Box>
              ))}
            <Text
              style={{
                fontFamily: 'MedievalSharp, serif',
                color: goldAccent ? accent : '#e5e7eb',
                fontWeight: 700,
                letterSpacing: '1px',
                fontSize: rem(18),
                textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                textTransform: 'uppercase',
              }}
              data-testid="card-title"
            >
              {title}
            </Text>
          </Group>

          {action && <Box>{action}</Box>}
        </Box>

        <Box
          p="md"
          data-testid="card-content"
          style={{
            flexGrow: 1,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            background:
              'linear-gradient(180deg, rgba(13,17,23,0.85), rgba(3,6,8,0.95))',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle at top right, rgba(255,255,255,0.06), transparent 55%)',
              pointerEvents: 'none',
            }}
          />
          {children}
        </Box>
      </Paper>
    </Box>
  );
};
