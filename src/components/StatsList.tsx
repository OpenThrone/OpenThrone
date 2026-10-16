import { Badge, Group, Stack } from '@mantine/core';
import { useMemo } from 'react';

import type { Loss } from '@/types/typings';
import { toLocale } from '@/utils/numberFormatting';

import RpgAwesomeIcon from './RpgAwesomeIcon';

interface Stats {
  pillagedGold: number | string;
  xpEarned: { defender: number; attacker: number };
  turns?: number;
  attacker_losses?: Loss;
  defender_losses?: Loss;
  forthpAtStart?: number;
  forthpAtEnd?: number;
}

interface StatsListProps {
  stats: Stats;
  type: string;
  subType: string;
  collapsed: boolean;
}

const StatsList: React.FC<StatsListProps> = ({
  stats,
  type,
  subType,
  collapsed,
}) => {
  const xp = useMemo(() => {
    if (type === 'defense') {
      return typeof stats.xpEarned === 'object'
        ? stats.xpEarned.defender
        : JSON.parse(stats.xpEarned).defender;
    }
    return typeof stats.xpEarned === 'object'
      ? stats.xpEarned.attacker
      : JSON.parse(stats.xpEarned).attacker;
  }, [stats.xpEarned, type]);

  if (subType !== 'attack') return null;

  return collapsed ? (
    <Group align="center" justify="center">
      <Badge size="lg" variant="light" color="gray" tt="none">
        <RpgAwesomeIcon icon="gold-bar" fw /> Gold:{' '}
        {toLocale(stats.pillagedGold.toLocaleString())}
      </Badge>
      <Badge size="lg" variant="light" color="gray" tt="none">
        XP: {xp}
      </Badge>
    </Group>
  ) : (
    <Stack align="center" justify="center" gap="xs">
      <Badge size="lg" variant="light" color="gray" tt="none">
        <RpgAwesomeIcon icon="gold-bar" fw /> Gold:{' '}
        {toLocale(stats.pillagedGold.toLocaleString())}
      </Badge>
      <Badge size="lg" variant="light" color="gray" tt="none">
        XP: {xp}
      </Badge>
      <Badge size="lg" variant="light" color="gray" tt="none">
        Turns: {stats.turns ?? 0}
      </Badge>
    </Stack>
  );
};

export default StatsList;
