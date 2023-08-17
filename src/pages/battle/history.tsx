import { getSession } from 'next-auth/react';

import AttackLogTable from '@/components/attacklog';
import prisma from '@/lib/prisma'; // Assuming this is the path to your prisma client

const WarHistory = ({ attackLogs, defenseLogs }) => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-4 text-2xl font-bold">War History</h1>

      <section className="mb-8">
        <h2 className="mb-2 text-xl">Attack Log</h2>
        <AttackLogTable logs={attackLogs} />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-xl">Defense Log</h2>
        <AttackLogTable logs={defenseLogs} />{' '}
        {/* Reusing the same table for defense logs */}
      </section>
    </div>
  );
};

export const getServerSideProps = async (context) => {
  // Assuming you can get the current user's ID from the request
  // Assuming you can get the current user's ID from the request
  const session = await getSession(context);
  const userId = session?.player?.id;

  // Fetch attack logs where the user is the attacker and include the related attacker and defender players
  const attackLogs = await prisma.attack_log.findMany({
    where: { attacker_id: userId },
    include: {
      attackerPlayer: true,
      defenderPlayer: true,
    },
  });

  // Fetch defense logs where the user is the defender and include the related attacker and defender players
  const defenseLogs = await prisma.attack_log.findMany({
    where: { defender_id: userId },
    include: {
      attackerPlayer: true,
      defenderPlayer: true,
    },
  });

  return { props: { attackLogs, defenseLogs } };
};

export default WarHistory;
