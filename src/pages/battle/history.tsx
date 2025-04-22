// pages/battle/history.tsx

import { getSession } from 'next-auth/react';
import { useState } from 'react';
import AttackLogTable from '@/components/AttackLog';
import prisma from '@/lib/prisma';
import { Pagination } from '@mantine/core';
import { InferGetServerSidePropsType } from "next";
import MainArea from '@/components/MainArea';

const ROWS_PER_PAGE = 5; // Match rows per page with Battle Users page

const WarHistory = ({ attackLogs, defenseLogs }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [attackPage, setAttackPage] = useState(1);
  const [defensePage, setDefensePage] = useState(1);

  // Calculate total pages
  const totalAttackPages = Math.ceil(attackLogs.length / ROWS_PER_PAGE);
  const totalDefensePages = Math.ceil(defenseLogs.length / ROWS_PER_PAGE);

  // Slice the logs for the current page
  const currentAttackLogs = attackLogs.slice(
    (attackPage - 1) * ROWS_PER_PAGE,
    attackPage * ROWS_PER_PAGE
  );

  const currentDefenseLogs = defenseLogs.slice(
    (defensePage - 1) * ROWS_PER_PAGE,
    defensePage * ROWS_PER_PAGE
  );

  return (
    <MainArea title="War History">

      {/* Attack Log Section */}
      <section className="mb-8">
        <h2 className="mb-2 text-xl">Attack Log</h2>
        <AttackLogTable logs={currentAttackLogs} type="attack" />

        {/* Pagination for Attack Logs */}
        <div className="mt-4 flex justify-between">
          <button
            type="button"
            className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
            onClick={() => setAttackPage((prev) => Math.max(prev - 1, 1))}
            disabled={attackPage === 1}
          >
            Previous
          </button>
          <Pagination
            total={totalAttackPages}
            value={attackPage}
            onChange={setAttackPage}
            siblings={1}
            boundaries={1}
          />
          <button
            type="button"
            className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
            onClick={() =>
              setAttackPage((prev) => Math.min(prev + 1, totalAttackPages))
            }
            disabled={attackPage === totalAttackPages}
          >
            Next
          </button>
        </div>
      </section>

      {/* Defense Log Section */}
      <section className="mb-8">
        <h2 className="mb-2 text-xl">Defense Log</h2>
        <AttackLogTable logs={currentDefenseLogs} type="defense" />

        {/* Pagination for Defense Logs */}
        <div className="mt-4 flex justify-between">
          <button
            type="button"
            className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
            onClick={() => setDefensePage((prev) => Math.max(prev - 1, 1))}
            disabled={defensePage === 1}
          >
            Previous
          </button>
          <Pagination
            total={totalDefensePages}
            value={defensePage}
            onChange={setDefensePage}
            siblings={1}
            boundaries={1}
          />
          <button
            type="button"
            className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
            onClick={() =>
              setDefensePage((prev) => Math.min(prev + 1, totalDefensePages))
            }
            disabled={defensePage === totalDefensePages}
          >
            Next
          </button>
        </div>
      </section>
    </MainArea>
  );
};


export const getServerSideProps = async (context: any) => {
  const session = await getSession(context);
  const userId = Number(session?.user?.id);

  // Fetch all attack logs where the user is the attacker
  const attackLogs = await prisma.attack_log.findMany({
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
  });

  // Fetch all defense logs where the user is the defender
  const defenseLogs = await prisma.attack_log.findMany({
    where: {
      defender_id: userId,
      OR: [{ type: 'attack' }, { winner: userId }],
    },
    include: {
      attackerPlayer: {
        select: { id: true, display_name: true },
      },
      defenderPlayer: {
        select: { id: true, display_name: true },
      },
    },
    orderBy: { timestamp: 'desc' },
  });

  return {
    props: {
      attackLogs: attackLogs.map(log => ({
        ...log,
        timestamp: log.timestamp.toISOString(), // Convert to ISO string
      })),
      defenseLogs: defenseLogs.map(log => ({
        ...log,
        timestamp: log.timestamp.toISOString(), // Convert to ISO string
      })),
    },
  };
};

export default WarHistory;
