import { faScroll } from '@fortawesome/free-solid-svg-icons';
import { Group, Pagination, useMantineTheme } from '@mantine/core';
import type { InferGetServerSidePropsType } from 'next';
import { getSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import AttackLogTable from '@/components/AttackLog';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import prisma from '@/lib/prisma';

const ROWS_PER_PAGE = 5;

const WarHistory = ({
  attackLogs,
  defenseLogs,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('battle');
  const [attackPage, setAttackPage] = useState(1);
  const [defensePage, setDefensePage] = useState(1);
  const theme = useMantineTheme();

  const totalAttackPages = Math.ceil(attackLogs.length / ROWS_PER_PAGE);
  const totalDefensePages = Math.ceil(defenseLogs.length / ROWS_PER_PAGE);

  const currentAttackLogs = attackLogs.slice(
    (attackPage - 1) * ROWS_PER_PAGE,
    attackPage * ROWS_PER_PAGE,
  );

  const currentDefenseLogs = defenseLogs.slice(
    (defensePage - 1) * ROWS_PER_PAGE,
    defensePage * ROWS_PER_PAGE,
  );

  return (
    <MainArea title={t('warHistory.title')}>
      <GameCard
        title={t('warHistory.attackLog')}
        icon={faScroll}
        style={{ marginBottom: theme.spacing.md }}
      >
        <AttackLogTable logs={currentAttackLogs} type="attack" />
        <Group justify="center" pt="md">
          <Pagination
            total={totalAttackPages}
            value={attackPage}
            onChange={setAttackPage}
            siblings={1}
            boundaries={1}
          />
        </Group>
      </GameCard>

      <GameCard title={t('warHistory.defenseLog')} icon={faScroll}>
        <AttackLogTable logs={currentDefenseLogs} type="defense" />
        <Group justify="center" pt="md">
          <Pagination
            total={totalDefensePages}
            value={defensePage}
            onChange={setDefensePage}
            siblings={1}
            boundaries={1}
          />
        </Group>
      </GameCard>
    </MainArea>
  );
};

export const getServerSideProps = async (context: any) => {
  const session = await getSession(context);
  const userId = Number(session?.user?.id);
  if (!session || !userId) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

  const [attackLogs, defenseLogs] = await Promise.all([
    prisma.attack_log.findMany({
      where: { attacker_id: userId, type: 'attack' },
      include: {
        attackerPlayer: {
          select: { id: true, display_name: true, avatar: true },
        },
        defenderPlayer: {
          select: { id: true, display_name: true, avatar: true },
        },
      },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.attack_log.findMany({
      where: {
        defender_id: userId,
        OR: [{ type: 'attack' }, { winner: userId }],
      },
      include: {
        attackerPlayer: { select: { id: true, display_name: true } },
        defenderPlayer: { select: { id: true, display_name: true } },
      },
      orderBy: { timestamp: 'desc' },
    }),
  ]);

  return {
    props: {
      attackLogs: attackLogs.map((log) => ({
        ...log,
        timestamp: log.timestamp?.toISOString() ?? null,
        pillaged_gold: log.pillaged_gold?.toString() ?? null,
      })),
      defenseLogs: defenseLogs.map((log) => ({
        ...log,
        timestamp: log.timestamp?.toISOString() ?? null,
        pillaged_gold: log.pillaged_gold?.toString() ?? null,
      })),
    },
  };
};

export default WarHistory;
