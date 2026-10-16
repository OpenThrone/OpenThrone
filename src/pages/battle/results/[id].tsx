import type { InferGetServerSidePropsType } from 'next';
import { getServerSession } from 'next-auth';
import { useTranslation } from 'next-i18next';

import AssassinateResult from '@/components/AssassinateResult';
import AttackResult from '@/components/attackResult';
import InfiltrationResult from '@/components/InfiltrationResult';
import IntelResult from '@/components/IntelResult';
import MainArea from '@/components/MainArea';
import { OrnatePanel } from '@/components/OrnatePanel';
import prisma from '@/lib/prisma';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import {
  ATTACK_LOG_ACL_SELECT,
  getAttackLogViewerRole,
  redactAttackLogForViewer,
} from '@/services/AttackLogAccess.service';
import { ensureActiveEra } from '@/services/Era.service';
import { localePrefix } from '@/utils/localeRedirect';

const PLAYER_SELECT = {
  id: true,
  display_name: true,
  avatar: true,
  race: true,
  experience: true,
} as const;

const ResultsPage = ({
  battle,
  lastGenerated,
  viewerID,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('battle');
  if (!battle) {
    return (
      <MainArea title={t('results.title')}>
        <p>{t('results.noPermission')}</p>
      </MainArea>
    );
  }

  return (
    <MainArea title={t('results.title')}>
      <OrnatePanel minHeight={300}>
        {battle.type === 'attack' ? (
          <AttackResult battle={battle} viewerID={Number(viewerID)} />
        ) : battle.type === 'ASSASSINATE' ? (
          <AssassinateResult battle={battle} viewerID={Number(viewerID)} />
        ) : battle.type === 'INFILTRATE' ? (
          <InfiltrationResult
            battle={battle}
            lastGenerated={lastGenerated}
            viewerID={Number(viewerID)}
          />
        ) : (
          <IntelResult
            battle={battle}
            lastGenerated={lastGenerated}
            viewerID={Number(viewerID)}
          />
        )}
      </OrnatePanel>
    </MainArea>
  );
};

// Server-side: only readers of the log get it, redacted for their role.
/** Returns the battle report the session user may see, or null. */
export const getServerSideProps = async (context) => {
  const { params } = context;
  const battleId = Number(params.id);
  const noBattle = {
    props: { battle: null, lastGenerated: null, viewerID: null },
  };

  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) {
    return {
      redirect: {
        destination: `${localePrefix(context.locale, context.defaultLocale)}/account/login`,
        permanent: false,
      },
    };
  }

  if (!Number.isSafeInteger(battleId) || battleId <= 0) {
    return noBattle;
  }

  const [battle, era] = await Promise.all([
    prisma.attack_log.findUnique({
      where: { id: battleId },
      include: {
        acl: { select: ATTACK_LOG_ACL_SELECT },
        attackerPlayer: { select: PLAYER_SELECT },
        defenderPlayer: { select: PLAYER_SELECT },
      },
    }),
    ensureActiveEra(),
  ]);

  // Missing, legacy-era and unreadable logs look the same to the viewer.
  if (!battle || !battle.timestamp || battle.timestamp < era.startDate) {
    return noBattle;
  }

  const viewerUserId = Number(session.user.id);
  const role = await getAttackLogViewerRole(viewerUserId, battle);
  if (!role) {
    return noBattle;
  }

  return {
    props: {
      battle: redactAttackLogForViewer(battle, role),
      lastGenerated: new Date().toISOString(),
      viewerID: viewerUserId,
    },
  };
};

export default ResultsPage;
