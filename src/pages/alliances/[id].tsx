import {
  Avatar,
  Box,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
  useMantineTheme,
} from '@mantine/core';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useState } from 'react';
import useSWR from 'swr';

import { AllianceAnnouncements } from '@/components/alliance/AllianceAnnouncements';
import { AllianceBank } from '@/components/alliance/AllianceBank';
import { AllianceDiplomacy } from '@/components/alliance/AllianceDiplomacy';
import { AllianceIntel } from '@/components/alliance/AllianceIntel';
import { AllianceLists } from '@/components/alliance/AllianceLists';
import { AllianceMembers } from '@/components/alliance/AllianceMembers';
import { AllianceOverview } from '@/components/alliance/AllianceOverview';
import { AllianceRanks } from '@/components/alliance/AllianceRanks';
import { AllianceSettings } from '@/components/alliance/AllianceSettings';
import { getAllianceStanding } from '@/components/alliance/allianceStanding';
import { AllianceWar } from '@/components/alliance/AllianceWar';
import MainArea from '@/components/MainArea';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { AllianceService } from '@/services';
import type { AllianceInfo } from '@/services/Alliance.service';
import { stringifyObj } from '@/utils/numberFormatting';

interface AlliancePageProps {
  initialAlliance: string;
  isMember: boolean;
  isLeader: boolean;
  viewerId: number | null;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load alliance (${res.status})`);
  return res.json();
};

const AlliancePage = ({
  initialAlliance,
  isMember,
  isLeader: initialIsLeader,
  viewerId,
}: AlliancePageProps) => {
  const { t } = useTranslation('alliances');
  const { t: tLists } = useTranslation('allianceLists');
  const { t: tAnn } = useTranslation('allianceAnnouncements');
  const { t: tIntel } = useTranslation('allianceIntel');
  const router = useRouter();
  const { id } = router.query;
  const theme = useMantineTheme();
  const [activeTab, setActiveTab] = useState<string | null>('overview');

  const {
    data: allianceData,
    error,
    mutate,
  } = useSWR(id ? `/api/alliances/${id}` : null, fetcher, {
    fallbackData: JSON.parse(initialAlliance),
    refreshInterval: 30000,
  });

  const alliance = (allianceData ||
    (initialAlliance ? JSON.parse(initialAlliance) : null)) as AllianceInfo;

  // Leadership can change while the page is open (transfer-leadership).
  const isLeader = alliance
    ? viewerId !== null && alliance.leader_id === viewerId
    : initialIsLeader;
  const canEditRanks =
    isMember &&
    !!alliance &&
    getAllianceStanding(alliance, viewerId).can('edit_ranks');

  if (error && !alliance) return <Text c="red">Failed to load alliance</Text>;
  if (!alliance)
    return (
      <Center h={300}>
        <Loader />
      </Center>
    );

  return (
    <MainArea title={alliance.name}>
      <Stack gap="lg">
        <Paper
          shadow="md"
          radius="md"
          p={0}
          style={{ overflow: 'hidden', position: 'relative' }}
        >
          <Box h={200} bg="dark.6">
            {alliance.bannerimg ? (
              <img
                src={alliance.bannerimg}
                alt="Banner"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Center
                h="100%"
                bg={`linear-gradient(45deg, ${theme.colors.blue[9]}, ${theme.colors.cyan[9]})`}
              >
                <Text size="xl" fw={700} c="white" opacity={0.3}>
                  {alliance.name}
                </Text>
              </Center>
            )}
          </Box>
          <Box p="md" mt={-60} style={{ position: 'relative', zIndex: 1 }}>
            <Group align="flex-end">
              <Avatar
                src={alliance.avatar}
                size={120}
                radius={120}
                style={{ border: `4px solid ${theme.colors.dark[7]}` }}
              />
              <Box mb="sm">
                <Title order={2}>{alliance.name}</Title>
                <Text c="dimmed">{alliance.motto}</Text>
              </Box>
            </Group>
          </Box>
        </Paper>

        <Tabs value={activeTab} onChange={setActiveTab} variant="outline">
          <Tabs.List>
            <Tabs.Tab value="overview">
              {t('index.overview', 'Overview')}
            </Tabs.Tab>
            {isMember && (
              <Tabs.Tab value="announcements">{tAnn('tab')}</Tabs.Tab>
            )}
            <Tabs.Tab value="members">{t('index.members', 'Members')}</Tabs.Tab>
            {isMember && (
              <Tabs.Tab value="bank">{t('index.bank', 'Bank')}</Tabs.Tab>
            )}
            {isMember && (
              <Tabs.Tab value="war">{t('index.war', 'War Room')}</Tabs.Tab>
            )}
            {isMember && (
              <Tabs.Tab value="lists">{tLists('tabs.lists', 'Lists')}</Tabs.Tab>
            )}
            {isMember && (
              <Tabs.Tab value="diplomacy">
                {tLists('tabs.diplomacy', 'Diplomacy')}
              </Tabs.Tab>
            )}
            {isMember && (
              <Tabs.Tab value="intel">{tIntel('tab', 'Intel')}</Tabs.Tab>
            )}
            {canEditRanks && (
              <Tabs.Tab value="ranks">{t('ranks.title', 'Ranks')}</Tabs.Tab>
            )}
            {(isLeader || isMember) && (
              <Tabs.Tab value="settings">
                {t('index.settings', 'Settings')}
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Box pt="md">
            <Tabs.Panel value="overview">
              <AllianceOverview
                alliance={alliance}
                isMember={isMember}
                onViewAnnouncements={() => setActiveTab('announcements')}
              />
            </Tabs.Panel>

            {isMember && (
              <Tabs.Panel value="announcements">
                <AllianceAnnouncements
                  allianceId={alliance.id}
                  viewerId={viewerId}
                />
              </Tabs.Panel>
            )}

            <Tabs.Panel value="members">
              <AllianceMembers
                alliance={alliance}
                viewerId={isMember ? viewerId : null}
                onUpdate={mutate}
              />
            </Tabs.Panel>

            {isMember && (
              <>
                <Tabs.Panel value="bank">
                  <AllianceBank alliance={alliance} onUpdate={mutate} />
                </Tabs.Panel>
                <Tabs.Panel value="war">
                  <AllianceWar alliance={alliance} viewerId={viewerId} />
                </Tabs.Panel>
                <Tabs.Panel value="lists">
                  <AllianceLists alliance={alliance} viewerId={viewerId} />
                </Tabs.Panel>
                <Tabs.Panel value="diplomacy">
                  <AllianceDiplomacy alliance={alliance} viewerId={viewerId} />
                </Tabs.Panel>
                <Tabs.Panel value="intel">
                  <AllianceIntel alliance={alliance} />
                </Tabs.Panel>
              </>
            )}

            {canEditRanks && (
              <Tabs.Panel value="ranks">
                <AllianceRanks
                  alliance={alliance}
                  viewerId={viewerId}
                  onUpdate={mutate}
                />
              </Tabs.Panel>
            )}

            {(isLeader || isMember) && (
              <Tabs.Panel value="settings">
                <AllianceSettings
                  alliance={alliance}
                  onUpdate={mutate}
                  isLeader={isLeader}
                />
              </Tabs.Panel>
            )}
          </Box>
        </Tabs>
      </Stack>
    </MainArea>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { id } = context.params as { id: string };

  try {
    const [session, i18nProps] = await Promise.all([
      getServerSession(context.req, context.res, authOptions),
      serverSideTranslations(context.locale ?? 'en', [
        'common',
        'alliances',
        'allianceLists',
        'allianceTreasury',
        'allianceAnnouncements',
        'allianceIntel',
        'navigation',
      ]),
    ]);

    const sessionUserId = Number(session?.user?.id);
    const viewerId = Number.isSafeInteger(sessionUserId) ? sessionUserId : null;
    // Signed-out visitors and non-members get the redacted view (ALL-08).
    const { alliance: allianceData, isMember } =
      await AllianceService.getAllianceForViewer(Number(id), viewerId);

    if (!allianceData) {
      return { notFound: true };
    }
    const alliance = stringifyObj(allianceData) as AllianceInfo;
    const isLeader = viewerId !== null && alliance.leader_id === viewerId;

    return {
      props: {
        ...i18nProps,
        initialAlliance: JSON.stringify(alliance),
        isMember,
        isLeader,
        viewerId,
      },
    };
  } catch {
    return {
      notFound: true,
    };
  }
};

export default AlliancePage;
