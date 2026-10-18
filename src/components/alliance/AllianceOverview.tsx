import { Card, Grid, Group, Text, Title } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { AllianceLatestAnnouncement } from '@/components/alliance/AllianceLatestAnnouncement';
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
  const { t } = useTranslation('alliances');

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 8 }}>
        {isMember && onViewAnnouncements && (
          <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
            <AllianceLatestAnnouncement
              allianceId={alliance.id}
              onViewAll={onViewAnnouncements}
            />
          </div>
        )}
        <Card withBorder padding="lg" radius="md">
          <Title order={3} mb="md">
            {t('overview.about', 'About Us')}
          </Title>
          <Text style={{ whiteSpace: 'pre-line' }}>
            {alliance.comments ||
              t('overview.noDescription', 'No description provided.')}
          </Text>
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 4 }}>
        <Card withBorder padding="lg" radius="md">
          <Title order={4} mb="md">
            {t('overview.stats', 'Stats')}
          </Title>
          <Group justify="space-between" mb="xs">
            <Text c="dimmed">{t('overview.leader', 'Leader')}</Text>
            <Text fw={500}>{alliance.leader?.display_name}</Text>
          </Group>
          <Group justify="space-between" mb="xs">
            <Text c="dimmed">{t('overview.members', 'Members')}</Text>
            <Text fw={500}>{toLocale(alliance._count?.members || 0)}</Text>
          </Group>
          <Group justify="space-between" mb="xs">
            <Text c="dimmed">{t('overview.created', 'Founded')}</Text>
            <Text fw={500}>
              {new Date(alliance.created_at).toLocaleDateString()}
            </Text>
          </Group>
          {/* Treasury is only sent to alliance members (ALL-08). */}
          {alliance.gold_in_bank != null && (
            <Group justify="space-between" mb="xs">
              <Text c="dimmed">{t('overview.gold', 'Treasury')}</Text>
              <Text fw={500} c="yellow">
                {toLocale(alliance.gold_in_bank)}
              </Text>
            </Group>
          )}
        </Card>
      </Grid.Col>
    </Grid>
  );
};
