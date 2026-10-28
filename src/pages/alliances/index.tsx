import { Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { useTranslation } from 'next-i18next';

import { AllianceCard } from '@/components/alliance/AllianceCard';
import { MyAllianceInvites } from '@/components/alliance/AllianceInvites';
import MainArea from '@/components/MainArea';
import { MAX_ALLIANCE_MEMBERSHIPS } from '@/constants/alliances';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { AllianceService } from '@/services/Alliance.service';
import { localePrefix } from '@/utils/localeRedirect';
import { serverSideTranslations } from '@/utils/serverTranslations';

type MyAlliance = {
  id: number;
  name: string;
  roleName: string;
  isLeader: boolean;
  memberCount: number;
  avatar: string | null;
  bannerimg: string | null;
  motto: string | null;
  gold: string;
};

/** Loads the signed-in player's alliances; visitors are sent to Browse. */
export const getServerSideProps: GetServerSideProps<{
  myAlliances: MyAlliance[];
}> = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  const userId = Number(session?.user?.id);

  if (!Number.isSafeInteger(userId)) {
    return {
      redirect: {
        destination: `${localePrefix(context.locale, context.defaultLocale)}/alliances/browse`,
        // Never permanent: the destination embeds the request locale, and a
        // cached 308 would pin players to one language indefinitely.
        permanent: false,
      },
    };
  }

  const [memberships, translations] = await Promise.all([
    AllianceService.getUserAlliances(userId),
    serverSideTranslations(context.locale ?? 'en', [
      'common',
      'alliances',
      'navigation',
    ]),
  ]);

  const myAlliances: MyAlliance[] = memberships.map((m) => ({
    id: m.alliance.id,
    name: m.alliance.name,
    roleName: m.role?.name ?? 'Member',
    isLeader: m.alliance.leader_id === userId,
    memberCount: m.alliance._count.members,
    avatar: m.alliance.avatar,
    bannerimg: m.alliance.bannerimg,
    motto: m.alliance.motto,
    gold: String(m.alliance.gold_in_bank),
  }));

  return { props: { ...translations, myAlliances } };
};

/** My Alliances: every alliance the player belongs to, with browse/create. */
export default function AlliancesIndex({
  myAlliances,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useTranslation('alliances');

  const leadsOne = myAlliances.some((a) => a.isLeader);
  const atLimit = myAlliances.length >= MAX_ALLIANCE_MEMBERSHIPS;
  let createBlockReason: string | null = null;
  if (leadsOne) createBlockReason = t('mine.createLeading');
  else if (atLimit) {
    createBlockReason = t('mine.createFull', { max: MAX_ALLIANCE_MEMBERSHIPS });
  }

  return (
    <MainArea title={t('mine.title')}>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text c="var(--ot-muted)">
            {t('mine.count', {
              count: myAlliances.length,
              max: MAX_ALLIANCE_MEMBERSHIPS,
            })}
          </Text>
          <Group gap="sm">
            <Button component={Link} href="/alliances/browse" variant="default">
              {t('mine.browse')}
            </Button>
            {createBlockReason ? (
              <Button disabled aria-describedby="alliances-create-reason">
                {t('mine.create')}
              </Button>
            ) : (
              <Button component={Link} href="/alliances/create">
                {t('mine.create')}
              </Button>
            )}
          </Group>
        </Group>
        {createBlockReason && (
          <Text id="alliances-create-reason" size="sm" c="var(--ot-muted)">
            {createBlockReason}
          </Text>
        )}

        <MyAllianceInvites />

        {myAlliances.length === 0 ? (
          <Text>{t('mine.empty')}</Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {myAlliances.map((alliance) => (
              <AllianceCard
                key={alliance.id}
                id={alliance.id}
                name={alliance.name}
                description={alliance.motto}
                imgsrc={alliance.avatar}
                bannerimgsrc={alliance.bannerimg}
                members={alliance.memberCount}
                gold={alliance.gold}
                isLeader={alliance.isLeader}
                roleName={alliance.roleName}
                userMembership
                joinText={undefined}
                joinMode={undefined}
                onJoin={undefined}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </MainArea>
  );
}
