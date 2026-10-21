import { Box, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export type BattleStat = {
  label: string;
  value: ReactNode;
  tone: 'normal' | 'gold' | 'bad' | 'good';
};

type BattleStatStripProps = {
  stats: BattleStat[];
};

const mix = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/**
 * The one stat-tone palette (#133), built from --ot-* tokens and Mantine's
 * green/red ramps so it retints with the race theme. Each glow is a soft halo
 * of its own colour over a dark legibility drop.
 */
export const STAT_TONES: Record<
  BattleStat['tone'],
  { color: string; glow: string; accent: string }
> = {
  normal: {
    color: 'var(--ot-heading)',
    glow: '0 2px 3px rgba(0,0,0,0.85)',
    accent: 'var(--ot-border)',
  },
  gold: {
    color: 'var(--ot-text)',
    glow: `0 0 14px ${mix('var(--ot-accent)', 28)}, 0 2px 3px rgba(0,0,0,0.9)`,
    accent: mix('var(--ot-accent)', 48),
  },
  good: {
    color: 'var(--mantine-color-green-3)',
    glow: `0 0 12px ${mix('var(--mantine-color-green-6)', 24)}, 0 2px 3px rgba(0,0,0,0.9)`,
    accent: mix('var(--mantine-color-green-6)', 38),
  },
  bad: {
    color: 'var(--mantine-color-red-4)',
    glow: `0 0 12px ${mix('var(--mantine-color-red-6)', 24)}, 0 2px 3px rgba(0,0,0,0.9)`,
    accent: mix('var(--mantine-color-red-6)', 38),
  },
};

/** Row of labelled stat tiles: battle reports and the simulator army forms. */
export function BattleStatStrip({ stats }: BattleStatStripProps) {
  return (
    <Box
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 0,
        borderTop: '1px solid var(--ot-border)',
        borderBottom: '1px solid var(--ot-border)',
        background:
          'linear-gradient(180deg, var(--ot-surface), var(--ot-inset))',
      }}
    >
      {stats.map((stat, index) => {
        const tone = STAT_TONES[stat.tone];

        return (
          <Box
            key={stat.label}
            style={{
              position: 'relative',
              padding: '14px 18px',
              borderLeft:
                index === 0
                  ? undefined
                  : `1px solid ${mix('var(--ot-accent)', 22)}`,
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
                fontFamily: 'MedievalSharp, serif',
                color: mix('var(--ot-heading)', 80),
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
