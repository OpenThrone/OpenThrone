import { Badge, Group, Stack } from '@mantine/core';
import { useTranslation } from 'next-i18next';
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
  const { t } = useTranslation('battle');
  // Spy logs carry no XP (and defenders see a redacted copy), so parse
  // defensively instead of crashing the whole War History page.
  const xp = useMemo(() => {
    const raw = stats?.xpEarned;
    let parsed: { attacker?: number; defender?: number } | null = null;
    if (raw && typeof raw === 'object') parsed = raw;
    else if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    return (type === 'defense' ? parsed?.defender : parsed?.attacker) ?? 0;
  }, [stats?.xpEarned, type]);

  if (subType !== 'attack') return null;

  return collapsed ? (
    <Group align="center" justify="center">
      <Badge size="lg" variant="light" color="gray" tt="none">
        <RpgAwesomeIcon icon="gold-bar" fw />{' '}
        {t('warHistory.goldBadge', {
          gold: toLocale(Number(stats.pillagedGold ?? 0)),
        })}
      </Badge>
      <Badge size="lg" variant="light" color="gray" tt="none">
        {t('warHistory.xpBadge', { xp: toLocale(xp) })}
      </Badge>
    </Group>
  ) : (
    <Stack align="center" justify="center" gap="xs">
      <Badge size="lg" variant="light" color="gray" tt="none">
        <RpgAwesomeIcon icon="gold-bar" fw />{' '}
        {t('warHistory.goldBadge', {
          gold: toLocale(Number(stats.pillagedGold ?? 0)),
        })}
      </Badge>
      <Badge size="lg" variant="light" color="gray" tt="none">
        {t('warHistory.xpBadge', { xp: toLocale(xp) })}
      </Badge>
      {/* Defenders get a redacted log without the attacker's turns. */}
      {stats.turns != null && (
        <Badge size="lg" variant="light" color="gray" tt="none">
          {t('warHistory.turnsBadge', { turns: toLocale(stats.turns) })}
        </Badge>
      )}
    </Stack>
  );
};

export default StatsList;
