import { Anchor, Button, Grid, Group, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { AllianceLatestAnnouncement } from '@/components/alliance/AllianceLatestAnnouncement';
import {
  AllianceDuesCard,
  duesLabel,
  duesTermsOf,
} from '@/components/alliance/AllianceMembershipDues';
import { allianceRequest } from '@/components/alliance/allianceStanding';
import { GameCard } from '@/components/game/GameCard';
import {
  allianceLevelNameKey,
  allianceUpgradesHref,
  getAllianceLevel,
} from '@/constants/allianceLevels';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo } from '@/services/Alliance.service';
import type { Locales } from '@/types/typings';
import { formatWhole } from '@/utils/formatWhole';

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
  const locale = i18n.language as Locales;
  const duesTerms = duesTermsOf(alliance);
  const level = getAllianceLevel(alliance.hall_level);
  const memberCount = alliance._count?.members || 0;
  const full = memberCount >= level.maxMembers;
  const router = useRouter();
  const [openingChat, setOpeningChat] = useState(false);

  const openChat = async () => {
    if (openingChat) return;
    setOpeningChat(true);
    try {
      const { roomId } = await allianceRequest('/api/alliances/chat', {
        allianceId: alliance.id,
      });
      await router.push(`/messaging?roomId=${roomId}`);
    } catch (error: any) {
      alertService.error(error.message);
      setOpeningChat(false);
    }
  };

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 8 }}>
        {/* A Stack for the same reason as the side column below: otherwise
            each card stretched to the full column height. */}
        <Stack gap="md">
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
        </Stack>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 4 }}>
        {/* A Stack, so each card keeps its own height: in the stretched
            column every GameCard frame (height: 100%) filled the column and
            pushed the dues and chat cards out of view. */}
        <Stack gap="md">
          <GameCard title={t('overview.stats', 'Stats')}>
            <Group justify="space-between" wrap="nowrap" gap="sm" mb="xs">
              <Text c="dimmed">{t('overview.leader', 'Leader')}</Text>
              <Text fw={500} ta="right">
                {alliance.leader?.display_name}
              </Text>
            </Group>
            <Group justify="space-between" wrap="nowrap" gap="sm" mb="xs">
              <Text c="dimmed">{t('overview.hall', 'Alliance Hall')}</Text>
              <Text fw={500} ta="right">
                {t('upgrades.levelLabel', {
                  name: t(allianceLevelNameKey(level.level), level.name),
                  level: level.level,
                })}
              </Text>
            </Group>
            <Group
              justify="space-between"
              wrap="nowrap"
              gap="sm"
              mb={full ? 2 : 'xs'}
            >
              <Text c="dimmed">{t('overview.members', 'Members')}</Text>
              <Text fw={500} ta="right" c={full ? 'orange' : undefined}>
                {t('upgrades.ofCap', {
                  value: formatWhole(memberCount, i18n.language as Locales),
                  cap: formatWhole(level.maxMembers, i18n.language as Locales),
                })}
              </Text>
            </Group>
            {full && (
              <Text size="xs" c="var(--ot-muted)" mb="xs">
                {t(
                  'overview.fullHint',
                  'The alliance is full: nobody can join until the Alliance Hall is upgraded.',
                )}{' '}
                {isMember && (
                  <Anchor
                    component={Link}
                    href={allianceUpgradesHref(alliance.id)}
                    scroll={false}
                    size="xs"
                  >
                    {t('upgrades.raiseLink', 'Upgrades')}
                  </Anchor>
                )}
              </Text>
            )}
            {/* Fee and dues are public: players see them before joining. */}
            {!isMember && (
              <>
                <Group justify="space-between" wrap="nowrap" gap="sm" mb="xs">
                  <Text c="dimmed">{t('memberDues.joinFee')}</Text>
                  <Text fw={500} ta="right">
                    {duesTerms.joinFee > 0n
                      ? t('currency.goldAmount', {
                          ns: 'common',
                          amount: formatWhole(duesTerms.joinFee, locale),
                        })
                      : t('memberDues.noFee')}
                  </Text>
                </Group>
                <Group justify="space-between" wrap="nowrap" gap="sm" mb="xs">
                  <Text c="dimmed">{t('memberDues.dues')}</Text>
                  <Text fw={500} ta="right">
                    {duesLabel(t, duesTerms, locale)}
                  </Text>
                </Group>
              </>
            )}
            <Group justify="space-between" wrap="nowrap" gap="sm" mb="xs">
              <Text c="dimmed">{t('overview.created', 'Founded')}</Text>
              <Text fw={500} ta="right">
                {new Date(alliance.created_at).toLocaleDateString(
                  i18n.language,
                )}
              </Text>
            </Group>
            {/* Treasury is only sent to alliance members (ALL-08). */}
            {alliance.gold_in_bank != null && (
              <Group justify="space-between" wrap="nowrap" gap="sm" mb="xs">
                <Text c="dimmed">{t('overview.gold', 'Treasury')}</Text>
                <Text fw={500} ta="right" c="yellow">
                  {formatWhole(alliance.gold_in_bank, i18n.language as Locales)}
                </Text>
              </Group>
            )}
          </GameCard>
          {isMember && alliance.status !== 'RESERVED' && (
            <AllianceDuesCard allianceId={alliance.id} />
          )}
          {/* A reserved alliance has no chat (the server refuses to open it). */}
          {isMember && alliance.status !== 'RESERVED' && (
            <GameCard title={t('overview.chatTitle', 'Alliance Chat')}>
              <Text size="sm" c="dimmed" mb="sm">
                {t(
                  'overview.chatHelp',
                  'A private conversation for every member, in your messages.',
                )}
              </Text>
              <Button fullWidth loading={openingChat} onClick={openChat}>
                {t('overview.chatOpen', 'Open alliance chat')}
              </Button>
            </GameCard>
          )}
        </Stack>
      </Grid.Col>
    </Grid>
  );
};
