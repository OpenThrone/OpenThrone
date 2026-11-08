import { Alert, Badge, Button, Group, List, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';

import { GameCard } from '@/components/game/GameCard';
import { toLocale } from '@/utils/numberFormatting';

/** Reactivation standing as served by /api/alliances/reactivate. */
export interface ReactivationProgressView {
  requirements: { minLevel: number; costGold: number };
  /** The leader's own standing; null for everyone else. */
  leader: {
    level: number;
    gold: string;
    inCurrentEra: boolean;
    meetsLevel: boolean;
    meetsGold: boolean;
  } | null;
  canReactivate: boolean;
}

export interface ReservedAllianceNoticeProps {
  allianceName: string;
  leaderName?: string | null;
  viewer: 'visitor' | 'member' | 'leader';
  progress?: ReactivationProgressView | null;
  /** Leader: opens the pay-and-reactivate confirmation. */
  onReactivate?: () => void;
  /** Member (not leader): leave the alliance. */
  onLeave?: () => void;
  busy?: boolean;
  error?: string | null;
  locale?: Parameters<typeof toLocale>[1];
}

/** Badge shown next to a reserved alliance's name in lists and profiles. */
export const ReservedBadge = ({ title }: { title?: string }) => {
  const { t } = useTranslation('alliances');
  return (
    <Badge color="orange" variant="light" size="sm" title={title}>
      {t('reserved.badge')}
    </Badge>
  );
};

const Requirement = ({
  met,
  label,
  now,
}: {
  met: boolean | null;
  label: ReactNode;
  now?: ReactNode;
}) => (
  <List.Item
    icon={
      <Text
        span
        c={met ? 'green' : met === false ? 'orange' : 'dimmed'}
        aria-hidden="true"
      >
        {met ? '✓' : '•'}
      </Text>
    }
  >
    <Text span size="sm">
      {label}
    </Text>
    {now && (
      <Text span size="sm" c="dimmed">
        {' '}
        ({now})
      </Text>
    )}
  </List.Item>
);

/**
 * Explains a reserved alliance (#13): why it is on hold, what stays open, and
 * what reactivation needs. The leader sees their progress and the pay button;
 * members see the same facts and can leave without the leader.
 */
export const ReservedAllianceNotice = ({
  allianceName,
  leaderName,
  viewer,
  progress,
  onReactivate,
  onLeave,
  busy = false,
  error,
  locale,
}: ReservedAllianceNoticeProps) => {
  const { t } = useTranslation('alliances');
  const cost = progress ? toLocale(progress.requirements.costGold, locale) : '';
  const minLevel = progress?.requirements.minLevel ?? 0;
  const leader = progress?.leader ?? null;

  return (
    <GameCard title={t('reserved.title', { name: allianceName })}>
      <Stack gap="sm" role="region" aria-label={t('reserved.badge')}>
        <Text size="sm">
          {viewer === 'visitor' ? t('reserved.visitor') : t('reserved.member')}
        </Text>
        {viewer !== 'visitor' && (
          <>
            <Text size="sm" c="dimmed">
              {t('reserved.stillOpen')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('reserved.closed')}
            </Text>
          </>
        )}
        {progress && (
          <Stack gap={4}>
            <Text fw={700} size="sm">
              {t('reserved.requirementsTitle')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('reserved.requirementsIntro', { level: minLevel, cost })}
            </Text>
            <List spacing={2} center listStyleType="none">
              <Requirement
                met={leader ? leader.meetsLevel : null}
                label={t('reserved.reqLevel', { level: minLevel })}
                now={
                  leader
                    ? t('reserved.reqLevelNow', {
                        current: leader.level,
                        level: minLevel,
                      })
                    : undefined
                }
              />
              <Requirement
                met={leader ? leader.meetsGold : null}
                label={t('reserved.reqGold', { cost })}
                now={
                  leader
                    ? t('reserved.reqGoldNow', {
                        current: toLocale(leader.gold, locale),
                        cost,
                      })
                    : undefined
                }
              />
            </List>
          </Stack>
        )}
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        {viewer === 'leader' && (
          <Group>
            <Button
              onClick={onReactivate}
              disabled={!progress?.canReactivate || busy}
              loading={busy}
            >
              {t('reserved.reactivate', { cost })}
            </Button>
          </Group>
        )}
        {viewer === 'member' && (
          <>
            <Text size="sm">
              {t('reserved.waitingForLeader', {
                leader: leaderName ?? t('reserved.theLeader'),
              })}
            </Text>
            <Group align="center">
              <Button
                variant="default"
                color="red"
                onClick={onLeave}
                disabled={busy}
              >
                {t('reserved.leave')}
              </Button>
              <Text size="xs" c="dimmed">
                {t('reserved.leaveHint')}
              </Text>
            </Group>
          </>
        )}
      </Stack>
    </GameCard>
  );
};
