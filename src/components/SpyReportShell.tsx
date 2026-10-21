import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { Button, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

import type { ParticipantHeaderProps } from '@/components/battle/ReportHeader';
import { ReportHeader } from '@/components/battle/ReportHeader';
import panelClasses from '@/components/game/Panels.module.css';
import { getLevelFromXP } from '@/utils/utilities';

import { GameCard } from './game/GameCard';
import Modal from './modal';
import SpyMissionsModal from './spyMissionsModal';

export type SpyMission = 'intel' | 'assassinate' | 'infiltrate';

/** Banner title keys per mission, from the spymaster's or the target's side. */
const DEFENDER_TITLES: Record<SpyMission, [string, string]> = {
  intel: ['intelReport.spiesGotThrough', 'intelReport.spiesRepelled'],
  assassinate: ['spyReport.assassinsStruck', 'spyReport.assassinsRepelled'],
  infiltrate: [
    'spyReport.infiltratorsBreached',
    'spyReport.infiltratorsRepelled',
  ],
};

const TITLES: Record<SpyMission, string> = {
  intel: 'intelReport.title',
  assassinate: 'spyReport.assassinationTitle',
  infiltrate: 'spyReport.infiltrationTitle',
};

const SUBTITLES: Record<SpyMission, string> = {
  intel: 'intelReport.subtitle',
  assassinate: 'spyReport.assassinationSubtitle',
  infiltrate: 'spyReport.infiltrationSubtitle',
};

/**
 * Shared frame for every spy mission report (intel, assassination,
 * infiltration): the battle report's banner and participant header, written
 * from the viewer's side, the follow-up actions, and the generated-at footer.
 */
export const SpyReportShell = ({
  battle,
  viewerID,
  mission,
  icon,
  lastGenerated,
  children,
}: {
  battle: any;
  viewerID: number;
  mission: SpyMission;
  icon: IconDefinition;
  lastGenerated?: string | number | Date;
  children?: ReactNode;
}) => {
  const { t } = useTranslation('common');
  const [isSpyModalOpen, setIsSpyModalOpen] = useState(false);
  const [isAttackModalOpen, setIsAttackModalOpen] = useState(false);
  const toggleSpyModal = useCallback(() => setIsSpyModalOpen((v) => !v), []);
  const toggleAttackModal = useCallback(
    () => setIsAttackModalOpen((v) => !v),
    [],
  );
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const isViewerAttacker = viewerID === attackerPlayer?.id;
  const isViewerDefender = viewerID === defenderPlayer?.id;
  const isAttackerWinner = winner === attackerPlayer?.id;

  const bannerTone = isViewerAttacker
    ? isAttackerWinner
      ? 'green'
      : 'red'
    : isViewerDefender
      ? isAttackerWinner
        ? 'red'
        : 'green'
      : 'blue';
  const bannerTitle = isViewerDefender
    ? t(DEFENDER_TITLES[mission][isAttackerWinner ? 0 : 1])
    : t(
        isAttackerWinner
          ? 'intelReport.missionSuccess'
          : 'intelReport.missionFailed',
      );

  const spyResults = stats?.spyResults ?? {};
  const attackerLevel =
    spyResults.attackerLevel ?? getLevelFromXP(attackerPlayer?.experience ?? 0);
  const defenderLevel =
    spyResults.defenderLevel ?? getLevelFromXP(defenderPlayer?.experience ?? 0);

  // The spymaster follows up on the target; the target can strike back.
  const followUpTarget = isViewerDefender ? attackerPlayer : defenderPlayer;
  const canFollowUp = isViewerAttacker || isViewerDefender || viewerID === 1;

  const participant = (
    player: any,
    side: 'attacker' | 'defender',
    role: string,
    level: number,
  ): ParticipantHeaderProps => ({
    player,
    side,
    role,
    levelLabel: `${t('intelReport.level')} ${level}`,
    avatarAlt: t(
      side === 'attacker'
        ? 'intelReport.attackerAvatar'
        : 'intelReport.defenderAvatar',
    ),
    profileLabel: t('intelReport.viewProfile', {
      player: player?.display_name,
    }),
  });

  return (
    <GameCard title={t(TITLES[mission])} icon={icon}>
      <ReportHeader
        banner={{
          tone: bannerTone,
          title: bannerTitle,
          subtitle: t(SUBTITLES[mission], {
            attacker: attackerPlayer?.display_name,
            defender: defenderPlayer?.display_name,
          }),
        }}
        attacker={participant(
          attackerPlayer,
          'attacker',
          t('intelReport.spymaster'),
          attackerLevel,
        )}
        defender={participant(
          defenderPlayer,
          'defender',
          t('intelReport.target'),
          defenderLevel,
        )}
        band={{
          label: t('intelReport.reportId'),
          reportId: battle.id,
          actions: canFollowUp && (
            <>
              {!isViewerDefender && (
                <Button onClick={toggleSpyModal} size="md" fullWidth px="xs">
                  {t('intelReport.sendMoreSpies')}
                </Button>
              )}
              <Button onClick={toggleAttackModal} size="md" fullWidth px="xs">
                {t(
                  isViewerDefender
                    ? 'spyReport.attackBack'
                    : 'intelReport.attack',
                )}
              </Button>
            </>
          ),
        }}
      />

      {children}

      {canFollowUp && followUpTarget?.id && (
        <>
          <SpyMissionsModal
            isOpen={isSpyModalOpen}
            toggleModal={toggleSpyModal}
            defenderID={followUpTarget.id}
          />
          <Modal
            isOpen={isAttackModalOpen}
            toggleModal={toggleAttackModal}
            profileID={followUpTarget.id}
            targetName={followUpTarget.display_name}
          />
        </>
      )}
      {lastGenerated && (
        <Text size="xs" c="dimmed" ta="center" mt="md">
          {t('spyReport.generated', {
            date: new Date(lastGenerated).toLocaleString(),
          })}
        </Text>
      )}
    </GameCard>
  );
};

/** A themed inset panel listing the mission log lines. */
export const MissionLog = ({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}) => (
  <GameCard title={title} goldAccent={false}>
    <Stack gap={6} ta="center" className={panelClasses.insetRow}>
      {lines.map((line) => (
        <Text key={line} c="gray.4">
          {line}
        </Text>
      ))}
    </Stack>
  </GameCard>
);
