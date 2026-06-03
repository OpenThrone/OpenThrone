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

import { AllianceBank } from '@/components/alliance/AllianceBank';
import { AllianceMembers } from '@/components/alliance/AllianceMembers';
import { AllianceOverview } from '@/components/alliance/AllianceOverview';
import { AllianceSettings } from '@/components/alliance/AllianceSettings';
import { AllianceWar } from '@/components/alliance/AllianceWar';
import MainArea from '@/components/MainArea';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { AllianceService } from '@/services';
import type { AllianceInfo } from '@/services/Alliance.service';
import { stringifyObj } from '@/utils/numberFormatting';

interface AlliancePageProps {
  initialAlliance: string; // JSON string
  isMember: boolean;
  isLeader: boolean;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const AlliancePage = ({
  initialAlliance,
  isMember,
  isLeader,
}: AlliancePageProps) => {
  const { t } = useTranslation('alliances');
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

  if (error) return <Text c="red">Failed to load alliance</Text>;
  if (!alliance)
    return (
      <Center h={300}>
        <Loader />
      </Center>
    );

  return (
    <MainArea title={alliance.name}>
      <Stack gap="lg">
        {/* Header Section */}
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

        {/* Tabs Section */}
        <Tabs value={activeTab} onChange={setActiveTab} variant="outline">
          <Tabs.List>
            <Tabs.Tab value="overview">
              {t('index.overview', 'Overview')}
            </Tabs.Tab>
            <Tabs.Tab value="members">{t('index.members', 'Members')}</Tabs.Tab>
            {isMember && (
              <Tabs.Tab value="bank">{t('index.bank', 'Bank')}</Tabs.Tab>
            )}
            {isMember && (
              <Tabs.Tab value="war">{t('index.war', 'War Room')}</Tabs.Tab>
            )}
            {(isLeader || isMember) && (
              <Tabs.Tab value="settings">
                {t('index.settings', 'Settings')}
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Box pt="md">
            <Tabs.Panel value="overview">
              <AllianceOverview alliance={alliance} />
            </Tabs.Panel>

            <Tabs.Panel value="members">
              <AllianceMembers alliance={alliance} />
            </Tabs.Panel>

            {isMember && (
              <>
                <Tabs.Panel value="bank">
                  <AllianceBank
                    alliance={alliance}
                    isLeader={isLeader}
                    onUpdate={mutate}
                  />
                </Tabs.Panel>
                <Tabs.Panel value="war">
                  <AllianceWar alliance={alliance} />
                </Tabs.Panel>
              </>
            )}

            {(isLeader || isMember) && (
              <Tabs.Panel value="settings">
                <AllianceSettings alliance={alliance} onUpdate={mutate} />
              </Tabs.Panel>
            )}
          </Box>
        </Tabs>
      </Stack>
    </MainArea>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  const { id } = context.params as { id: string };

  try {
    const allianceData = await AllianceService.getAllianceById(Number(id));
    if (!allianceData) {
      return { notFound: true };
    }
    const alliance = stringifyObj(allianceData) as AllianceInfo;

    const user = session?.user;
    let isMember = false;
    let isLeader = false;

    if (user) {
      // We can check memberships from session if available, or just check the alliance members usage
      // Since allianceData.members is fetched, we can check there
      // Note: getAllianceById includes members but might limit them? No, the code says includes members.
      isMember =
        alliance.members?.some((m) => m.user_id === Number(user.id)) ?? false;
      isLeader = alliance.leader_id === Number(user.id);
    }

    return {
      props: {
        ...(await serverSideTranslations(context.locale ?? 'en', [
          'common',
          'alliances',
          'navigation',
        ])),
        initialAlliance: JSON.stringify(alliance),
        isMember,
        isLeader,
      },
    };
  } catch (error) {
    return {
      notFound: true,
    };
  }
};

export default AlliancePage;
