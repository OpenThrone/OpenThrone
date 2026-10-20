import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { Box, Button, Grid, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

import classes from '@/components/AttackResults.module.css';
import type { PlayerRace } from '@/types/typings';
import { getAssetPath, getAvatarSrc, getLevelFromXP } from '@/utils/utilities';

import { BattleResultBanner } from './BattleResultBanner';
import { FramedAvatar } from './FramedAvatar';
import { GameCard } from './game/GameCard';
import Modal from './modal';
import SpyMissionsModal from './spyMissionsModal';

export type SpyMission = 'intel' | 'assassinate' | 'infiltrate';

export const themedButtonStyle = {
  background: 'linear-gradient(180deg, rgba(37,85,124,1), rgba(12,36,59,1))',
  border: '1px solid rgba(201,166,89,0.42)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 18px rgba(0,0,0,0.35)',
  fontFamily: 'MedievalSharp, serif',
};

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

/** Name, level and role block styled like the battle report's participants. */
const ParticipantIdentity = ({
  name,
  level,
  role,
  levelLabel,
}: {
  name?: string;
  level: number;
  role: string;
  levelLabel: string;
}) => (
  <Box className={classes.identity}>
    <Text className={classes.name}>{name}</Text>
    <Text size="sm" c="dimmed" tt="uppercase" mt={6}>
      {levelLabel} {level}
    </Text>
    <Box
      mt="md"
      style={{
        height: 1,
        width: '100%',
        background:
          'linear-gradient(90deg, rgba(201,166,89,0.55), transparent)',
      }}
    />
    <Text
      mt="sm"
      size="sm"
      style={{
        fontFamily: 'MedievalSharp, serif',
        color: 'rgba(236,229,211,0.78)',
      }}
    >
      {role}
    </Text>
  </Box>
);

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
  const frame = (race?: string) =>
    getAssetPath('avatarFrame', null, (race as PlayerRace) || 'ELF');
  const avatar = (player: any) =>
    getAvatarSrc(player?.avatar || 'SHIELD', player?.race, '150x150');

  // The spymaster follows up on the target; the target can strike back.
  const followUpTarget = isViewerDefender ? attackerPlayer : defenderPlayer;
  const canFollowUp = isViewerAttacker || isViewerDefender || viewerID === 1;

  const participant = (
    player: any,
    side: 'attacker' | 'defender',
    role: string,
  ) => {
    const portrait = (
      <Box
        className={
          side === 'defender'
            ? `${classes.defenderAvatar} ${classes.portrait}`
            : classes.portrait
        }
      >
        <FramedAvatar
          frameSrc={frame(player?.race)}
          src={avatar(player)}
          alt={t(
            side === 'attacker'
              ? 'intelReport.attackerAvatar'
              : 'intelReport.defenderAvatar',
          )}
          size={240}
          insetX={40}
          insetY={58}
          objectFit="cover"
        />
      </Box>
    );
    const identity = (
      <ParticipantIdentity
        name={player?.display_name}
        level={side === 'attacker' ? attackerLevel : defenderLevel}
        role={role}
        levelLabel={t('intelReport.level')}
      />
    );
    return (
      <Box
        className={`${classes.participant} ${classes[side]}`}
        component={Link}
        href={`/userprofile/${player?.id}`}
        aria-label={t('intelReport.viewProfile', {
          player: player?.display_name,
        })}
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        {side === 'attacker' ? (
          <>
            {portrait}
            {identity}
          </>
        ) : (
          <>
            {identity}
            {portrait}
          </>
        )}
      </Box>
    );
  };

  return (
    <GameCard title={t(TITLES[mission])} icon={icon}>
      <BattleResultBanner
        tone={bannerTone}
        title={bannerTitle}
        subtitle={t(SUBTITLES[mission], {
          attacker: attackerPlayer?.display_name,
          defender: defenderPlayer?.display_name,
        })}
      />

      <Box
        className={classes.battleHeader}
        style={{
          position: 'relative',
          padding: '8px 28px 18px',
          minHeight: 286,
          display: 'flex',
          alignItems: 'center',
          marginTop: -26,
        }}
      >
        <Grid align="center" gutter="xl" style={{ width: '100%' }}>
          <Grid.Col
            span={{ base: 12, md: 'auto' }}
            className={classes.participantColumn}
          >
            {participant(
              attackerPlayer,
              'attacker',
              t('intelReport.spymaster'),
            )}
          </Grid.Col>

          <Grid.Col
            span={{ base: 12, md: 'content' }}
            className={classes.battleId}
          >
            <Stack
              align="center"
              gap={8}
              style={{
                minWidth: 200,
                padding: '16px 10px',
                background:
                  'radial-gradient(circle at center, rgba(201,166,89,0.09), transparent 68%)',
                borderTop: '1px solid rgba(201,166,89,0.22)',
                borderBottom: '1px solid rgba(201,166,89,0.22)',
              }}
            >
              <Text
                size="xs"
                tt="uppercase"
                c="dimmed"
                style={{ letterSpacing: '0.12em' }}
              >
                {t('intelReport.reportId')}
              </Text>
              <Text
                size="xl"
                fw={700}
                style={{
                  fontFamily: 'MedievalSharp, serif',
                  color: '#e8d39a',
                  lineHeight: 1,
                }}
              >
                {battle.id}
              </Text>
              {canFollowUp && (
                <>
                  {!isViewerDefender && (
                    <Button
                      onClick={toggleSpyModal}
                      size="md"
                      fullWidth
                      px="xs"
                      style={{ ...themedButtonStyle, marginTop: 8 }}
                    >
                      {t('intelReport.sendMoreSpies')}
                    </Button>
                  )}
                  <Button
                    onClick={toggleAttackModal}
                    size="md"
                    fullWidth
                    px="xs"
                    style={{
                      ...themedButtonStyle,
                      ...(isViewerDefender ? { marginTop: 8 } : {}),
                    }}
                  >
                    {t(
                      isViewerDefender
                        ? 'spyReport.attackBack'
                        : 'intelReport.attack',
                    )}
                  </Button>
                </>
              )}
            </Stack>
          </Grid.Col>

          <Grid.Col
            span={{ base: 12, md: 'auto' }}
            className={classes.participantColumn}
          >
            {participant(defenderPlayer, 'defender', t('intelReport.target'))}
          </Grid.Col>
        </Grid>
      </Box>

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
    <Stack
      gap={6}
      style={{
        backgroundColor: 'var(--ot-inset, #0f141a)',
        borderRadius: 6,
        border: '1px solid var(--ot-line, #1f2b3b)',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
        padding: 12,
        textAlign: 'center',
      }}
    >
      {lines.map((line) => (
        <Text key={line} c="gray.4">
          {line}
        </Text>
      ))}
    </Stack>
  </GameCard>
);
