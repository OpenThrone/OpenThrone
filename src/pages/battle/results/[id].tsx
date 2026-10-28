import { Button, Group } from '@mantine/core';
import type { InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import AssassinateResult from '@/components/AssassinateResult';
import AttackResult from '@/components/attackResult';
import { BattleGameEventContext } from '@/components/battle/BattleGameEventContext';
import { ReportShareModal } from '@/components/battle/ReportShareModal';
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
  const [sharingOpen, setSharingOpen] = useState(false);
  if (!battle) {
    return (
      <MainArea title={t('results.title')}>
        <p>{t('results.noPermission')}</p>
        {!viewerID && (
          <Button component={Link} href="/account/login">
            {t('sharing.signIn')}
          </Button>
        )}
      </MainArea>
    );
  }

  return (
    <MainArea title={t('results.title')}>
      {(Number(viewerID) === battle.attacker_id ||
        Number(viewerID) === battle.defender_id) && (
        <Group justify="flex-end" mb="md">
          <Button variant="light" onClick={() => setSharingOpen(true)}>
            {t('sharing.title')}
          </Button>
          <ReportShareModal
            logId={battle.id}
            opened={sharingOpen}
            onClose={() => setSharingOpen(false)}
          />
        </Group>
      )}
      <OrnatePanel minHeight={300}>
        {battle.type !== 'attack' && (
          <BattleGameEventContext value={battle.stats?.gameEvents} />
        )}
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
  context.res.setHeader('Cache-Control', 'private, no-store');
  const session = await getServerSession(context.req, context.res, authOptions);
  const noBattle = {
    props: {
      battle: null,
      lastGenerated: null,
      viewerID: Number(session?.user?.id ?? 0),
    },
  };

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
    prisma.era.findFirst({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
    }),
  ]);

  // Missing, legacy-era and unreadable logs look the same to the viewer.
  if (
    !battle ||
    !era ||
    !battle.timestamp ||
    battle.timestamp < era.startDate
  ) {
    return noBattle;
  }

  const viewerUserId = Number(session?.user?.id ?? 0);
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
