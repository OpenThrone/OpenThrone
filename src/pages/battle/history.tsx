import { usePathname, useRouter } from 'next/navigation';
import { getSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import AttackLogTable from '@/components/attacklog';
import prisma from '@/lib/prisma';
import { InferGetServerSidePropsType } from "next";

// Assuming this is the path to your prisma client
const ROWS_PER_PAGE = 5;
const WarHistory = ({
                      attackLogs,
                      defenseLogs,
                      attackPage: initialAttackPage,
                      defensePage: initialDefensePage,
                    }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();
  const [attackPage, setAttackPage] = useState(initialAttackPage);
  const [defensePage, setDefensePage] = useState(initialDefensePage);
  const pathName = usePathname();
  useEffect(() => {
    setAttackPage(
      parseInt(pathName as string) || initialAttackPage
    );
    setDefensePage(
      parseInt(pathName as string) || initialDefensePage
    );
  }, [pathName, initialAttackPage, initialDefensePage]);
  return (
    <div className="container mx-auto p-4">
      <h2 className="page-title mb-4 text-2xl font-bold">War History</h2>

      <section className="mb-8">
        <h2 className="mb-2 text-xl">Attack Log</h2>
        <AttackLogTable logs={attackLogs} type="attack" />
      </section>
      <div className="mt-4 flex justify-between">
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => {
            const newPage = Math.max(attackPage - 1, 1);
            setAttackPage(newPage);
            router.push(`?attackPage=${newPage}`);
          }}
          disabled={attackPage === 1}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => {
            const newPage = attackPage + 1;
            setAttackPage(newPage);
            router.push(`?attackPage=${newPage}`);
          }}
          disabled={attackLogs.length < ROWS_PER_PAGE}
        >
          Next
        </button>
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-xl">Defense Log</h2>
        <AttackLogTable logs={defenseLogs} type="defense" />{' '}
      </section>
      <div className="mt-4 flex justify-between">
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => {
            const newPage = Math.max(defensePage - 1, 1);
            setDefensePage(newPage);
            router.push(`?defensePage=${newPage}`);
          }}
          disabled={defensePage === 1}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => {
            const newPage = defensePage + 1;
            setDefensePage(newPage);
            router.push(`?defensePage=${newPage}`);
          }}
          disabled={defenseLogs.length < ROWS_PER_PAGE}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export const getServerSideProps = async (context: any) => {
  const session = await getSession(context);
  const userId = parseInt(session?.user?.id.toString());

  const attackPage = parseInt(context.query.attackPage as string) || 1;
  const defensePage = parseInt(context.query.defensePage as string) || 1;

  const attackSkip = (attackPage - 1) * ROWS_PER_PAGE;
  const defenseSkip = (defensePage - 1) * ROWS_PER_PAGE;

  // Fetch attack logs where the user is the attacker and include the related attacker and defender players
  const attackLogs = await prisma.attack_log.findMany({
    where: { attacker_id: userId, type: 'attack' },
    include: {
      attackerPlayer: true,
      defenderPlayer: true,
    },
    skip: attackSkip,
    take: ROWS_PER_PAGE,
    orderBy: {
      timestamp: 'desc',
    },
  });

  // Fetch defense logs where the user is the defender and include the related attacker and defender players
  const defenseLogs = await prisma.attack_log.findMany({
    where: { defender_id: userId },
    include: {
      attackerPlayer: true,
      defenderPlayer: true,
    },
    skip: defenseSkip,
    take: ROWS_PER_PAGE,
    orderBy: {
      timestamp: 'desc',
    },
  });

  const filteredDefenseLogs = defenseLogs.filter((log) => {
    if (log.type === 'attack') {
      return true;
    }
    if (log.winner === userId) {
      return true;
    }
    return false;
  })

  return {
    props: {
      attackLogs, defenseLogs: filteredDefenseLogs, attackPage, defensePage } };
};

export default WarHistory;
