import { faScroll } from '@fortawesome/free-solid-svg-icons';
import {
  Box,
  Button,
  Grid,
  SimpleGrid,
  Stack,
  Text,
  useMantineTheme,
} from '@mantine/core';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import classes from '@/components/AttackResults.module.css';
import { DefenseAdvisory } from '@/components/DefenseAdvisory';
import { PlayerRace } from '@/types/typings';
import { toLocale } from '@/utils/numberFormatting';
import {
  getAssetPath,
  getAvatarSrc,
  getLevelChange,
  getLevelFromXP,
} from '@/utils/utilities';

import { BattleLedger } from './BattleLedger';
import { BattleResultBanner } from './BattleResultBanner';
import { BattleStatStrip } from './BattleStatStrip';
import { FramedAvatar } from './FramedAvatar';
import { GameCard } from './game/GameCard';
import LossesList from './LossesList';
import Modal from './modal';

const AttackResults = ({ battle, viewerID }) => {
  const { t } = useTranslation('battle');
  const reduceMotion = useReducedMotion();
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const isViewerAttacker = viewerID === attackerPlayer.id;
  const isViewerDefender = viewerID === defenderPlayer.id;
  const isPlayerWinner = winner === viewerID;
  const isAttackerWinner = winner === attackerPlayer.id;
  const allowAttackerProfile = !isViewerAttacker;
  const allowDefenderProfile = !isViewerDefender;
  const [isOpen, setIsOpen] = useState(false);
  const theme = useMantineTheme();

  const toggleModal = () => setIsOpen((v) => !v);

  const totalLosses = (losses: string | { total?: number }): number => {
    try {
      const parsedLosses =
        typeof losses === 'string' ? JSON.parse(losses) : losses;
      return parsedLosses.total ?? 0;
    } catch {
      return 0;
    }
  };

  // Redacted reports carry fortDamage; absolute fort HP is defender-only.
  const fortDamage: number =
    stats.fortDamage ?? stats.forthpAtStart - stats.forthpAtEnd;
  const attackerTotalLosses = toLocale(totalLosses(stats.attacker_losses));
  const defenderTotalLosses = toLocale(totalLosses(stats.defender_losses));

  const countUnitsOfType = (units, type) => {
    const unitsArray = Array.isArray(units) ? units : Object.values(units);
    const count = unitsArray
      .filter((unit) => unit.type === type)
      .reduce((acc, curr) => acc + curr.quantity, 0);
    return { count, label: toLocale(count) };
  };

  const xpEarned = JSON.parse(stats.xpEarned);
  const attackerLevelChange = getLevelChange(
    stats.startOfAttack.Attacker.experience,
    xpEarned.attacker,
  );
  const defenderLevelChange = getLevelChange(
    stats.startOfAttack.Defender.experience,
    xpEarned.defender,
  );
  const levelUpLines = (
    [
      [attackerLevelChange, attackerPlayer, isViewerAttacker],
      [defenderLevelChange, defenderPlayer, isViewerDefender],
    ] as const
  ).flatMap(([change, player, isViewer]) => {
    if (!change) return [];
    const name = isViewer ? t('report.you') : player.display_name;
    return [
      t('report.levelUpLine', { player: name, level: change.to }),
      ...(change.endedProtection
        ? [t('report.protectionEndedLine', { player: name })]
        : []),
    ];
  });

  const attackingSoldiers = countUnitsOfType(
    stats.startOfAttack.Attacker.units,
    'OFFENSE',
  );
  const attackerLossCount = totalLosses(stats.attacker_losses);
  const defenderLossCount = totalLosses(stats.defender_losses);
  const xpLine = (isViewer: boolean, playerName: string, xp: number) =>
    isViewer
      ? t('timeline.youEarnedXp', { xp: toLocale(xp) })
      : t('timeline.playerEarnedXp', { player: playerName, xp: toLocale(xp) });
  const lossLine = (isViewer: boolean, playerName: string, count: number) =>
    isViewer
      ? t('timeline.youLostSoldiers', { count, dead: toLocale(count) })
      : t('timeline.playerLostSoldiers', {
          count,
          player: playerName,
          dead: toLocale(count),
        });

  const summaryLines = [
    t('timeline.battleId', { id: battle.id }),
    isViewerAttacker
      ? t('timeline.youAttacked', { defender: defenderPlayer.display_name })
      : isViewerDefender
        ? t('timeline.attackedYou', { attacker: attackerPlayer.display_name })
        : t('timeline.playerAttacked', {
            attacker: attackerPlayer.display_name,
            defender: defenderPlayer.display_name,
          }),
    t('timeline.attackingForce', {
      count: attackingSoldiers.count,
      soldiers: attackingSoldiers.label,
    }),
    isViewerDefender
      ? t('timeline.yourCounterKilled', {
          count: attackerLossCount,
          dead: attackerTotalLosses,
        })
      : t('timeline.counterKilled', {
          count: attackerLossCount,
          player: defenderPlayer.display_name,
          dead: attackerTotalLosses,
        }),
    isPlayerWinner
      ? t('timeline.youWon')
      : t('report.winner', {
          player: isAttackerWinner
            ? attackerPlayer.display_name
            : defenderPlayer.display_name,
        }),
    xpLine(isViewerAttacker, attackerPlayer.display_name, xpEarned.attacker),
    xpLine(isViewerDefender, defenderPlayer.display_name, xpEarned.defender),
    ...levelUpLines,
    // Loot accrues on the turns the attacker won even when the verdict is a loss.
    t('timeline.goldPillaged', { gold: toLocale(stats.pillagedGold ?? 0) }),
    t('timeline.fortDamage', { damage: toLocale(fortDamage) }),
    lossLine(isViewerAttacker, attackerPlayer.display_name, attackerLossCount),
    lossLine(isViewerDefender, defenderPlayer.display_name, defenderLossCount),
  ];

  const sentence = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: reduceMotion
        ? { delayChildren: 0, staggerChildren: 0 }
        : { delayChildren: 1, staggerChildren: 0.06 },
    },
  };
  const letter = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: reduceMotion ? 0 : 0.3 } },
  };

  const frameSrc = getAssetPath(
    'avatarFrame',
    null,
    (defenderPlayer?.race as PlayerRace) || 'ELF',
  );
  const attackerFrameSrc = getAssetPath(
    'avatarFrame',
    null,
    (attackerPlayer?.race as PlayerRace) || 'ELF',
  );
  const attackerAvatarSrc = getAvatarSrc(
    attackerPlayer?.avatar || 'SHIELD',
    attackerPlayer?.race,
    '150x150',
  );
  const defenderAvatarSrc = getAvatarSrc(
    defenderPlayer?.avatar || 'SHIELD',
    defenderPlayer?.race,
    '150x150',
  );
  const attackerProfileHref = `/userprofile/${attackerPlayer?.id}`;
  const defenderProfileHref = `/userprofile/${defenderPlayer?.id}`;

  return (
    <GameCard title={t('battleReport.title')} icon={faScroll}>
      <Box
        className="battle-report-page"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        <BattleResultBanner
          tone={isPlayerWinner ? 'green' : 'red'}
          title={
            isViewerAttacker || isViewerDefender
              ? t(isPlayerWinner ? 'report.victory' : 'report.defeat')
              : t(
                  isAttackerWinner
                    ? 'report.attackerVictory'
                    : 'report.defenderVictory',
                )
          }
          subtitle={t('report.winner', {
            player: isAttackerWinner
              ? attackerPlayer.display_name
              : defenderPlayer.display_name,
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
              <Box
                className={`${classes.participant} ${classes.attacker}`}
                component={allowAttackerProfile ? Link : 'div'}
                href={allowAttackerProfile ? attackerProfileHref : undefined}
                aria-label={
                  allowAttackerProfile
                    ? t('battleReport.viewProfile', {
                        player: attackerPlayer?.display_name,
                      })
                    : undefined
                }
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  cursor: allowAttackerProfile ? 'pointer' : 'default',
                }}
              >
                <Box className={classes.portrait}>
                  <FramedAvatar
                    frameSrc={attackerFrameSrc}
                    src={attackerAvatarSrc}
                    alt={t('battleReport.attackerAvatar')}
                    size={240}
                    insetX={40}
                    insetY={58}
                    objectFit="cover"
                  />
                </Box>

                <Box className={classes.identity}>
                  <Text className={classes.name}>
                    {attackerPlayer?.display_name}
                  </Text>

                  <Text size="sm" c="dimmed" tt="uppercase" mt={6}>
                    {t('battleReport.level', {
                      level: getLevelFromXP(
                        stats.startOfAttack.Attacker.experience,
                      ),
                    })}
                    {attackerLevelChange && (
                      <Text component="span" size="sm" fw={700} c="#f7d98b">
                        {' '}
                        → {attackerLevelChange.to}
                      </Text>
                    )}
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
                    {t('battleReport.attacker')}
                  </Text>
                </Box>
              </Box>
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
                  {t('battleReport.battleId')}
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

                {(isViewerAttacker || isViewerDefender) && (
                  <Button
                    onClick={toggleModal}
                    variant="filled"
                    size="md"
                    fullWidth
                    px="xs"
                    style={{
                      marginTop: 8,
                      background:
                        'linear-gradient(180deg, rgba(37,85,124,1), rgba(12,36,59,1))',
                      border: '1px solid rgba(201,166,89,0.42)',
                      boxShadow:
                        'inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 18px rgba(0,0,0,0.35)',
                      fontFamily: 'MedievalSharp, serif',
                    }}
                  >
                    {isViewerAttacker
                      ? t('battleReport.attackAgain')
                      : t('battleReport.attackBack')}
                  </Button>
                )}

                {(isViewerAttacker || isViewerDefender) && (
                  <Modal
                    isOpen={isOpen}
                    toggleModal={toggleModal}
                    profileID={
                      isViewerAttacker ? defenderPlayer.id : attackerPlayer.id
                    }
                    targetName={
                      isViewerAttacker
                        ? defenderPlayer.display_name
                        : attackerPlayer.display_name
                    }
                  />
                )}
              </Stack>
            </Grid.Col>

            <Grid.Col
              span={{ base: 12, md: 'auto' }}
              className={classes.participantColumn}
            >
              <Box
                className={`${classes.participant} ${classes.defender}`}
                component={allowDefenderProfile ? Link : 'div'}
                href={allowDefenderProfile ? defenderProfileHref : undefined}
                aria-label={
                  allowDefenderProfile
                    ? t('battleReport.viewProfile', {
                        player: defenderPlayer?.display_name,
                      })
                    : undefined
                }
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  cursor: allowDefenderProfile ? 'pointer' : 'default',
                }}
              >
                <Box className={classes.identity}>
                  <Text className={classes.name}>
                    {defenderPlayer?.display_name}
                  </Text>

                  <Text size="sm" c="dimmed" tt="uppercase" mt={6}>
                    {t('battleReport.level', {
                      level: getLevelFromXP(
                        stats.startOfAttack.Defender.experience,
                      ),
                    })}
                    {defenderLevelChange && (
                      <Text component="span" size="sm" fw={700} c="#f7d98b">
                        {' '}
                        → {defenderLevelChange.to}
                      </Text>
                    )}
                  </Text>

                  <Box
                    mt="md"
                    style={{
                      height: 1,
                      width: '100%',
                      background:
                        'linear-gradient(270deg, rgba(201,166,89,0.55), transparent)',
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
                    {t('battleReport.defender')}
                  </Text>
                </Box>

                <Box
                  className={`${classes.defenderAvatar} ${classes.portrait}`}
                >
                  <FramedAvatar
                    frameSrc={frameSrc}
                    src={defenderAvatarSrc}
                    alt={t('battleReport.defenderAvatar')}
                    size={240}
                    insetX={40}
                    insetY={58}
                    objectFit="cover"
                  />
                </Box>
              </Box>
            </Grid.Col>
          </Grid>
        </Box>

        <BattleStatStrip
          stats={[
            {
              label: t('battleReport.goldPillaged'),
              value: isAttackerWinner ? toLocale(stats.pillagedGold) : '0',
              tone: 'gold',
            },
            {
              label: t('battleReport.fortDamage'),
              value: toLocale(fortDamage),
              tone: 'bad',
            },
            {
              label: t('report.attackerLosses'),
              value: attackerTotalLosses,
              tone: isAttackerWinner ? 'good' : 'bad',
            },
            {
              label: t('report.defenderLosses'),
              value: defenderTotalLosses,
              tone: isAttackerWinner ? 'bad' : 'good',
            },
          ]}
        />

        {isViewerDefender && (
          <Box mt="md">
            <DefenseAdvisory
              stats={stats}
              isViewerDefender={isViewerDefender}
            />
          </Box>
        )}

        <Box style={{ marginTop: 18 }}>
          <BattleLedger>
            <Grid gutter="xl">
              <Grid.Col span={{ base: 12, md: 7 }}>
                <Stack gap="sm">
                  <Text
                    style={{
                      fontFamily: 'Cinzel, MedievalSharp, serif',
                      color: '#e8d39a',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {t('battleReport.timeline')}
                  </Text>

                  <AnimatePresence>
                    {summaryLines.map((line, i) => (
                      <motion.div
                        variants={sentence}
                        initial="hidden"
                        animate="visible"
                        exit={{ opacity: 0 }}
                        key={`${i}-log-line`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '34px 1fr',
                          gap: 12,
                          alignItems: 'start',
                          padding: '7px 0',
                          borderTop:
                            i === 0
                              ? undefined
                              : '1px solid rgba(201,166,89,0.12)',
                        }}
                      >
                        <Text
                          size="xs"
                          style={{
                            fontFamily: 'Cinzel, serif',
                            color: 'rgba(201,166,89,0.8)',
                            paddingTop: 2,
                          }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </Text>

                        <Text
                          component="p"
                          style={{
                            margin: 0,
                            fontFamily: 'MedievalSharp, serif',
                            color: theme.colors.gray[4],
                            lineHeight: 1.45,
                          }}
                        >
                          {line.split('').map((char, index) => (
                            <motion.span
                              key={`${char}-${index}`}
                              variants={letter}
                            >
                              {char}
                            </motion.span>
                          ))}
                        </Text>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </Stack>
              </Grid.Col>

              <Grid.Col
                span={{ base: 12, md: 5 }}
                className={classes.participantColumn}
              >
                <Stack gap="md">
                  <Box>
                    <Text
                      style={{
                        fontFamily: 'Cinzel, MedievalSharp, serif',
                        color: '#e8d39a',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {t('battleReport.spoilsOfWar')}
                    </Text>

                    <SimpleGrid cols={2} spacing="xs" mt="sm">
                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {t('battleReport.gold')}
                        </Text>
                        <Text fw={700} c="#f7d98b">
                          {isAttackerWinner
                            ? toLocale(stats.pillagedGold)
                            : '0'}
                        </Text>
                      </Box>

                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {t('battleReport.fortDamage')}
                        </Text>
                        <Text fw={700} c="red.4">
                          {toLocale(fortDamage)}
                        </Text>
                      </Box>

                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {t('battleReport.attackerXp')}
                        </Text>
                        <Text fw={700}>{toLocale(xpEarned.attacker)}</Text>
                      </Box>

                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {t('battleReport.defenderXp')}
                        </Text>
                        <Text fw={700}>{toLocale(xpEarned.defender)}</Text>
                      </Box>
                    </SimpleGrid>
                  </Box>

                  <Box
                    style={{
                      height: 1,
                      background:
                        'linear-gradient(90deg, transparent, rgba(201,166,89,0.45), transparent)',
                    }}
                  />

                  <Box>
                    <Text
                      style={{
                        fontFamily: 'Cinzel, MedievalSharp, serif',
                        color: '#e8d39a',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {t('battleReport.casualties')}
                    </Text>

                    <SimpleGrid cols={2} spacing="xs" mt="sm">
                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {t(
                            isViewerAttacker
                              ? 'report.yourLosses'
                              : 'report.attackerLost',
                          )}
                        </Text>
                        <Text
                          fw={700}
                          c={isAttackerWinner ? 'green.4' : 'red.4'}
                        >
                          <LossesList
                            losses={stats.attacker_losses}
                            align="flex-start"
                          />
                        </Text>
                      </Box>

                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {t(
                            isViewerDefender
                              ? 'report.yourLosses'
                              : 'report.defenderLost',
                          )}
                        </Text>
                        <Text
                          fw={700}
                          c={isAttackerWinner ? 'red.4' : 'green.4'}
                        >
                          <LossesList
                            losses={stats.defender_losses}
                            align="flex-start"
                          />
                        </Text>
                      </Box>
                    </SimpleGrid>
                  </Box>
                </Stack>
              </Grid.Col>
            </Grid>
          </BattleLedger>
        </Box>
      </Box>
    </GameCard>
  );
};

export default AttackResults;
