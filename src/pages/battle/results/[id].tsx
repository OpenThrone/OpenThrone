import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import AttackResult from '@/components/attackResult';
import IntelResult from '@/components/IntelResult';
import AssassinateResult from '@/components/AssassinateResult';
import InfiltrationResult from '@/components/InfiltrationResult';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

const ResultsPage = ({ battle, lastGenerated }) => {

  if (!battle) {
    return <p>You do not have permission to view this battle log.</p>;
  }

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Battle Results</h2>
      {battle.type === 'attack' ? (
        <AttackResult battle={battle} />
      ) : battle.type === 'ASSASSINATE' ? (
        <AssassinateResult battle={battle} />
      ) : battle.type === 'INFILTRATE' ? (
        <InfiltrationResult battle={battle} lastGenerated={lastGenerated} />
      ) : (
        <IntelResult battle={battle} lastGenerated={lastGenerated} />
      )}
    </div>
  );
};

// Server-Side Rendering with session and permission check
export const getServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return {
      redirect: {
        destination: '/auth/signin',
        permanent: false,
      },
    };
  }

  const { params } = context;
  const battleId = parseInt(params.id, 10);

  // Get the current user's permissions
  const userPermissions = await prisma.permissionGrant.findMany({
    where: {
      user_id: session.user.id,
    },
  });

  // Check if the user has "MODERATOR" or "ADMINISTRATOR" permission
  const hasPermission = userPermissions.some(
    (perm) => perm.type === 'MODERATOR' || perm.type === 'ADMINISTRATOR'
  );

  if (!hasPermission) {
    return {
      props: {
        battle: null,
      },
    };
  }

  // Fetch battle details from the database
  const battle = await prisma.attack_log.findFirst({
    where: { id: battleId },
    include: {
      attackerPlayer: {
        select: {
          id: true,
          display_name: true,
        },
      },
      defenderPlayer: {
        select: {
          id: true,
          display_name: true,
        },
      },
      acl: {
        include: {
          shared_with_user: true, // Check if shared with specific users
          shared_with_alliance: true, // Check if shared with an alliance
        },
      },
    },
  });

  if (!battle) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      battle,
      lastGenerated: new Date().toISOString(),
    },
  };
};

export default ResultsPage;
