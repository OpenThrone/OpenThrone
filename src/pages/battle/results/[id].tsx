import { AnimatePresence, motion } from 'framer-motion';

import prisma from '@/lib/prisma';
import { getSession } from 'next-auth/react';
import { getLevelFromXP } from '@/utils/utilities';
import AttackResult from '@/components/attackResult';
import IntelResult from '@/components/IntelResult';
import AssassinateResult from '@/components/AssassinateResult';

const results = ({ battle, viewerID }) => {
  const { stats } = battle;

  console.log('stats', stats);
  console.log(battle)

  return (
    <div className="mainArea pb-10">
      <h2>Battle Results</h2>
      {battle.type === 'attack' ? (
        <AttackResult battle={battle} viewerID={viewerID} />
      ) : battle.type === 'ASSASSINATE' ? (
        <AssassinateResult battle={battle} viewerID={viewerID} />
      ) : (
        <IntelResult battle={battle} viewerID={viewerID} />
      )}
    </div>
  );
};

export const getServerSideProps = async (context) => {
  const { query } = context;
  const id = parseInt(query.id, 10);

  const session = await getSession(context);
  const viewerID = parseInt(session?.user?.id.toString());

  const results = await prisma.attack_log.findFirst({
    where: { id },
    include: {
      attackerPlayer: {
        select: {
          id: true,
          display_name: true,
          race:true
        },
      },
      defenderPlayer: {
        select: {
          id: true,
          display_name: true,
          race: true
        },
      },
    },
  });

  return { props: { battle: results, viewerID } };
};

export default results;
