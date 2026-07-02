import { Box, Text } from '@mantine/core';
import type { ReactNode } from 'react';

type BattleStat = {
  label: string;
  value: ReactNode;
  tone: 'normal' | 'gold' | 'bad' | 'good';
};

type BattleStatStripProps = {
  stats: BattleStat[];
};

const toneStyles: Record<
  BattleStat['tone'],
  { color: string; glow: string; accent: string }
> = {
  normal: {
    color: '#f3ead2',
    glow: '0 2px 3px rgba(0,0,0,0.85)',
    accent: 'rgba(201,166,89,0.24)',
  },
  gold: {
    color: '#ffd56f',
    glow: '0 0 14px rgba(255, 199, 89, 0.28), 0 2px 3px rgba(0,0,0,0.9)',
    accent: 'rgba(255, 199, 89, 0.48)',
  },
  good: {
    color: '#8ee6a1',
    glow: '0 0 12px rgba(79, 209, 107, 0.24), 0 2px 3px rgba(0,0,0,0.9)',
    accent: 'rgba(79, 209, 107, 0.38)',
  },
  bad: {
    color: '#f08d7f',
    glow: '0 0 12px rgba(229, 83, 67, 0.24), 0 2px 3px rgba(0,0,0,0.9)',
    accent: 'rgba(229, 83, 67, 0.38)',
  },
};

/** Battle stat strip. */
export function BattleStatStrip({ stats }: BattleStatStripProps) {
  return (
    <Box
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${stats.length}, minmax(120px, 1fr))`,
        gap: 0,
        borderTop: '1px solid rgba(201,166,89,0.35)',
        borderBottom: '1px solid rgba(201,166,89,0.35)',
        background:
          'linear-gradient(180deg, rgba(16,20,26,0.92), rgba(6,8,12,0.96))',
      }}
    >
      {stats.map((stat, index) => {
        const tone = toneStyles[stat.tone];

        return (
          <Box
            key={stat.label}
            style={{
              position: 'relative',
              padding: '14px 18px',
              borderLeft:
                index === 0 ? undefined : '1px solid rgba(201,166,89,0.22)',
            }}
          >
            <Box
              aria-hidden
              style={{
                position: 'absolute',
                left: 18,
                right: 18,
                top: 0,
                height: 1,
                background: `linear-gradient(90deg, transparent, ${tone.accent}, transparent)`,
              }}
            />

            <Text
              size="xs"
              style={{
                fontFamily: 'Cinzel, serif',
                color: 'rgba(220, 196, 135, 0.85)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {stat.label}
            </Text>

            <Text
              size="lg"
              fw={700}
              style={{
                fontFamily: 'MedievalSharp, serif',
                color: tone.color,
                textShadow: tone.glow,
              }}
            >
              {stat.value}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
