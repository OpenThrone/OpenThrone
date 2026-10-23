import { Grid, Group, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { AllianceLatestAnnouncement } from '@/components/alliance/AllianceLatestAnnouncement';
import { GameCard } from '@/components/game/GameCard';
import { useUser } from '@/context/users';
import type { AllianceInfo } from '@/services/Alliance.service';
import { toLocale } from '@/utils/numberFormatting';

interface AllianceOverviewProps {
  alliance: AllianceInfo;
  isMember?: boolean;
  onViewAnnouncements?: () => void;
}

/** Alliance overview. */
export const AllianceOverview = ({
  alliance,
  isMember = false,
  onViewAnnouncements,
}: AllianceOverviewProps) => {
  const { t, i18n } = useTranslation('alliances');
  const { user } = useUser();

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 8 }}>
        {isMember && onViewAnnouncements && (
          <AllianceLatestAnnouncement
            allianceId={alliance.id}
            onViewAll={onViewAnnouncements}
          />
        )}
        <GameCard title={t('overview.about', 'About Us')}>
          <Text style={{ whiteSpace: 'pre-line' }}>
            {alliance.comments ||
              t('overview.noDescription', 'No description provided.')}
          </Text>
        </GameCard>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 4 }}>
        <GameCard title={t('overview.stats', 'Stats')}>
          <Group justify="space-between" mb="xs">
            <Text c="dimmed">{t('overview.leader', 'Leader')}</Text>
            <Text fw={500}>{alliance.leader?.display_name}</Text>
          </Group>
          <Group justify="space-between" mb="xs">
            <Text c="dimmed">{t('overview.members', 'Members')}</Text>
            <Text fw={500}>
              {toLocale(alliance._count?.members || 0, user?.locale)}
            </Text>
          </Group>
          <Group justify="space-between" mb="xs">
            <Text c="dimmed">{t('overview.created', 'Founded')}</Text>
            <Text fw={500}>
              {new Date(alliance.created_at).toLocaleDateString(i18n.language)}
            </Text>
          </Group>
          {/* Treasury is only sent to alliance members (ALL-08). */}
          {alliance.gold_in_bank != null && (
            <Group justify="space-between" mb="xs">
              <Text c="dimmed">{t('overview.gold', 'Treasury')}</Text>
              <Text fw={500} c="yellow">
                {toLocale(alliance.gold_in_bank, user?.locale)}
              </Text>
            </Group>
          )}
        </GameCard>
      </Grid.Col>
    </Grid>
  );
};
