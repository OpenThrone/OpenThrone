import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import AttackResult from '@/components/attackResult';
import IntelResult from '@/components/IntelResult';
import AssassinateResult from '@/components/AssassinateResult';
import InfiltrationResult from '@/components/InfiltrationResult';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { InferGetServerSidePropsType } from "next";

const ResultsPage = ({ battle, lastGenerated, viewerID }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  if (!battle) {
    return <p>You do not have permission to view this battle log.</p>;
  }

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Battle Results</h2>
      {battle.type === 'attack' ? (
        <AttackResult battle={battle} viewerID={viewerID} />
      ) : battle.type === 'ASSASSINATE' ? (
          <AssassinateResult battle={battle} viewerID={viewerID} />
      ) : battle.type === 'INFILTRATE' ? (
            <InfiltrationResult battle={battle} lastGenerated={lastGenerated} viewerID={viewerID} />
      ) : (
              <IntelResult battle={battle} lastGenerated={lastGenerated} viewerID={viewerID} />
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

  // Fetch the battle details first
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
          shared_with_user: {
            select: {
              id: true,
            },
          },
          shared_with_alliance: true, // If you are checking for shared alliances
        },
      },
    },
  });

  if (!battle) {
    return {
      notFound: true,
    };
  }

  // Get the current user's permissions
  const userPermissions = await prisma.permissionGrant.findMany({
    where: {
      user_id: session.user.id,
    },
  });

  // Check if the user has "MODERATOR" or "ADMINISTRATOR" permission
  const isModeratorOrAdmin = userPermissions.some(
    (perm) => perm.type === 'MODERATOR' || perm.type === 'ADMINISTRATOR'
  );

  // Check if the user is the attacker or defender
  const isAttacker = battle.attackerPlayer.id === session.user.id;
  const isDefender = battle.defenderPlayer.id === session.user.id;

  // Check if the user is part of the ACL (Access Control List)
  const isInACL = battle.acl.some((aclEntry) => {
    // Check if it's shared with the user
    if (aclEntry.shared_with_user) {
      return aclEntry.shared_with_user.id === session.user.id;
    }
    // Check if it's shared with the user's alliance (if applicable)
    if (aclEntry.shared_with_alliance) {
      // Assuming the session holds the user's alliance id
      return aclEntry.shared_with_alliance.id === session.user.alliance_id;
    }
    return false;
  });

  // Combine all permission checks
  const hasPermission = isModeratorOrAdmin || isAttacker || isDefender || isInACL;

  if (!hasPermission) {
    return {
      props: {
        battle: null,
      },
    };
  }

  return {
    props: {
      battle,
      lastGenerated: new Date().toISOString(),
      viewerID: session.user.id,
    },
  };
};

export default ResultsPage;
