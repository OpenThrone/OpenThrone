import { Button, Group } from '@mantine/core';
import type { InferGetServerSidePropsType } from 'next';
import { getServerSession } from 'next-auth';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { AllianceIntelShareModal } from '@/components/alliance/AllianceIntelShareModal';
import AssassinateResult from '@/components/AssassinateResult';
import AttackResult from '@/components/attackResult';
import InfiltrationResult from '@/components/InfiltrationResult';
import IntelResult from '@/components/IntelResult';
import MainArea from '@/components/MainArea';
import { OrnatePanel } from '@/components/OrnatePanel';
import prisma from '@/lib/prisma';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { AllianceIntelService } from '@/services/AllianceIntel.service';
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
  shareTargets,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('battle');
  const { t: tIntel } = useTranslation('allianceIntel');
  const [shareTarget, setShareTarget] = useState<
    NonNullable<typeof shareTargets>[number] | null
  >(null);
  const [sharedIds, setSharedIds] = useState<number[]>([]);
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
      {shareTargets && shareTargets.length > 0 && (
        <Group mt="md" gap="xs">
          {shareTargets.map((target) => (
            <Button
              key={target.allianceId}
              variant="light"
              disabled={
                target.alreadyShared || sharedIds.includes(target.allianceId)
              }
              onClick={() => setShareTarget(target)}
            >
              {target.alreadyShared || sharedIds.includes(target.allianceId)
                ? tIntel('share.alreadyShared', 'Already shared')
                : shareTargets.length > 1
                  ? tIntel('share.buttonNamed', 'Share with {{name}}', {
                      name: target.allianceName,
                    })
                  : tIntel('share.button', 'Share with alliance')}
            </Button>
          ))}
        </Group>
      )}
      {shareTarget && (
        <AllianceIntelShareModal
          opened
          onClose={() => setShareTarget(null)}
          allianceId={shareTarget.allianceId}
          attackLogId={battle.id}
          canReportThreat={shareTarget.canReportThreat}
          onShared={() =>
            setSharedIds((ids) => [...ids, shareTarget.allianceId])
          }
        />
      )}
    </MainArea>
  );
};

// Server-side: only readers of the log get it, redacted for their role.
/** Returns the battle report the session user may see, or null. */
export const getServerSideProps = async (context) => {
  const { params } = context;
  const battleId = Number(params.id);
  const noBattle = {
    props: {
      battle: null,
      lastGenerated: null,
      viewerID: null,
      shareTargets: null,
    },
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

  // Only the attacker or defender can pass a report on to an alliance.
  const shareTargets =
    role === 'attacker' || role === 'defender'
      ? await AllianceIntelService.getShareTargets(viewerUserId, battle.id)
      : [];

  return {
    props: {
      battle: redactAttackLogForViewer(battle, role),
      lastGenerated: new Date().toISOString(),
      viewerID: viewerUserId,
      shareTargets,
    },
  };
};

export default ResultsPage;
