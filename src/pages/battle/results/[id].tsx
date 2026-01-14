import { getServerSession } from 'next-auth';
import { useTranslation } from 'next-i18next';
import prisma from '@/lib/prisma';
import AttackResult from '@/components/attackResult';
import IntelResult from '@/components/IntelResult';
import AssassinateResult from '@/components/AssassinateResult';
import InfiltrationResult from '@/components/InfiltrationResult';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

import MainArea from '@/components/MainArea';

import { serializeDates } from '@/utils/utilities';
import { InferGetServerSidePropsType } from "next";

const ResultsPage = ({ battle, lastGenerated, viewerID }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('battle');
  if (!battle) {
    return <MainArea title={t('results.title')}><p>{t('results.noPermission')}</p></MainArea>;
  }

  return (
    <MainArea title={t('results.title')}>
      {battle.type === 'attack' ? (
        <AttackResult battle={battle} viewerID={Number(viewerID)} />
      ) : battle.type === 'ASSASSINATE' ? (
        <AssassinateResult battle={battle} viewerID={Number(viewerID)} />
      ) : battle.type === 'INFILTRATE' ? (
        <InfiltrationResult battle={battle} lastGenerated={lastGenerated} viewerID={Number(viewerID)} />
      ) : (
        <IntelResult battle={battle} lastGenerated={lastGenerated} viewerID={Number(viewerID)} />
      )}
    </MainArea>
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
  const battleId = Number(params.id);

  // Fetch battle details first
  const battle = await prisma.attack_log.findFirst({
    where: { id: battleId },
    include: {
      attackerPlayer: {
        select: {
          id: true,
          display_name: true,
          avatar: true,
        },
      },
      defenderPlayer: {
        select: {
          id: true,
          display_name: true,
          avatar: true,
          race: true
        },
      },
    },
  });

  // Get current user's permissions
  const userPermissions = await prisma.permissionGrant.findMany({
    where: {
      user_id: session.user.id,
    },
  });

  // Check if user has "MODERATOR" or "ADMINISTRATOR" permission
  const isModeratorOrAdmin = userPermissions.some(
    (perm) => perm.type === 'MODERATOR' || perm.type === 'ADMINISTRATOR'
  );

  // Check if user is attacker or defender
  const isAttacker = battle.attackerPlayer.id === session.user.id;
  const isDefender = battle.defenderPlayer.id === session.user.id;

  // Check if user is part of ACL (Access Control List)
  const isInACL = battle.acl.some((aclEntry) => {
    // Check if it's shared with user
    if (aclEntry.shared_with_user) {
      return aclEntry.shared_with_user.id === session.user.id;
    }
    // Check if it's shared with user's alliance (if applicable)
    if (aclEntry.shared_with_alliance) {
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
        lastGenerated: null,
        viewerID: null,
      },
    };
  }

  return {
    props: {
      battle: serializeDates(battle),
      lastGenerated: new Date().toISOString(),
      viewerID: session.user.id,
    },
  };
};

export default ResultsPage;
