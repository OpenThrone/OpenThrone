import { getServerSession } from 'next-auth';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import prisma from '@/lib/prisma';
import AttackResult from '@/components/attackResult';
import IntelResult from '@/components/IntelResult';
import AssassinateResult from '@/components/AssassinateResult';
import InfiltrationResult from '@/components/InfiltrationResult';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { InferGetServerSidePropsType } from "next";

import { serializeDates } from '@/utils/utilities';
import MainArea from '@/components/MainArea';

import { getSafeLocale } from '@/utils/i18n';

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

  // Fetch the battle details first
  const battle = await prisma.attack_log.findFirst({
    where: { id: battleId },
    include: {
      attackerPlayer: {
        select: {
          id: true,
          display_name: true,
          race: true,
        },
      },
      defenderPlayer: {
        select: {
          id: true,
          display_name: true,
          race: true
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
        lastGenerated: null,
        viewerID: null,
        ...(await serverSideTranslations(getSafeLocale(context), ['battle'])),
      },
    };
  }

  return {
    props: {
      battle: serializeDates(battle),
      lastGenerated: new Date().toISOString(),
      viewerID: session.user.id,
      ...(await serverSideTranslations(getSafeLocale(context), ['battle'])),
    },
  };
};

export default ResultsPage;