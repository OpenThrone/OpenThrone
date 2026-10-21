import type { TextProps } from '@mantine/core';
import { Text } from '@mantine/core';

import { usePlayerIdentity } from '@/hooks/usePlayerIdentity';
import { themes } from '@/styles/themes';

type RaceKey = keyof typeof themes;

const isRaceKey = (value: string): value is RaceKey =>
  Object.prototype.hasOwnProperty.call(themes, value);

/**
 * Text colour for a player's race: a light shade of that race's own `brand`
 * palette, so an Elf reads green and a Goblin red whatever the viewer's theme.
 * Every shade clears 4.5:1 on the dark stone surfaces.
 */
export const getRaceTextColor = (race?: string | null): string | undefined => {
  const key = race?.toUpperCase();
  if (!key || !isRaceKey(key)) return undefined;
  return themes[key].colors?.brand?.[2];
};

export type PlayerIdentityLineProps = Omit<TextProps, 'children'> & {
  race?: string | null;
  playerClass?: string | null;
  /** Element to render; defaults to `div` so it can sit beside block content. */
  component?: 'div' | 'span' | 'p';
};

/** Localised "Elf Fighter" line with the race name in that race's colour. */
export function PlayerIdentityLine({
  race,
  playerClass,
  component = 'div',
  ...textProps
}: PlayerIdentityLineProps) {
  const { raceName, className } = usePlayerIdentity();
  const raceKey = race?.toUpperCase() ?? '';
  const raceLabel = isRaceKey(raceKey) ? raceName(raceKey) : (race ?? '');
  const classLabel = playerClass ? className(playerClass.toUpperCase()) : '';

  if (!raceLabel && !classLabel) return null;

  return (
    <Text component={component} size="xs" c="dimmed" {...textProps}>
      {raceLabel && (
        <Text span inherit fw={600} c={getRaceTextColor(raceKey)}>
          {raceLabel}
        </Text>
      )}
      {raceLabel && classLabel ? ' ' : null}
      {classLabel}
    </Text>
  );
}

export default PlayerIdentityLine;
