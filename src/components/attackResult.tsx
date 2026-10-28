import { faScroll } from '@fortawesome/free-solid-svg-icons';
import {
  Box,
  Button,
  Grid,
  Group,
  SimpleGrid,
  Stack,
  Text,
  useMantineTheme,
} from '@mantine/core';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import classes from '@/components/AttackResults.module.css';
import { BattleGameEventContext } from '@/components/battle/BattleGameEventContext';
import { GarrisonFatigueNotice } from '@/components/battle/GarrisonFatigueNotice';
import { ReportHeader } from '@/components/battle/ReportHeader';
import { DefenseAdvisory } from '@/components/DefenseAdvisory';
import { useUser } from '@/context/users';
import type { Locales } from '@/types/typings';
import { formatGold, toLocale } from '@/utils/numberFormatting';
import { getLevelChange, getLevelFromXP } from '@/utils/utilities';

import { BattleLedger } from './BattleLedger';
import { BattleStatStrip } from './BattleStatStrip';
import { GameCard } from './game/GameCard';
import LossesList from './LossesList';
import Modal from './modal';

const AttackResults = ({ battle, viewerID }) => {
  const { t, i18n } = useTranslation('battle');
  const { user } = useUser();
  const locale = user?.locale ?? (i18n.language as Locales);
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
  const attackerTotalLosses = toLocale(
    totalLosses(stats.attacker_losses),
    locale,
  );
  const defenderTotalLosses = toLocale(
    totalLosses(stats.defender_losses),
    locale,
  );

  const countUnitsOfType = (units, type) => {
    const unitsArray = Array.isArray(units) ? units : Object.values(units);
    const count = unitsArray
      .filter((unit) => unit.type === type)
      .reduce((acc, curr) => acc + curr.quantity, 0);
    return { count, label: toLocale(count, locale) };
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
  // Garrison fatigue (#204) is recorded on the log for both sides to read.
  const garrisonFatigue =
    Number(
      stats?.defender_fatigue_percent ?? stats?.defenderFatiguePercent ?? 0,
    ) || 0;
  // Dungeon captives (#210) are recorded on the log for both sides to read.
  const captivesTaken = Number(stats?.captives_taken ?? 0) || 0;
  // Undead reanimation (#211): the redaction hands each side only its own
  // risen count, so the line reads the same for attacker and defender.
  const reanimatedUnits = Number(stats?.reanimated_units ?? 0) || 0;
  const xpLine = (isViewer: boolean, playerName: string, xp: number) =>
    isViewer
      ? t('timeline.youEarnedXp', { xp: toLocale(xp, locale) })
      : t('timeline.playerEarnedXp', {
          player: playerName,
          xp: toLocale(xp, locale),
        });
  const lossLine = (isViewer: boolean, playerName: string, count: number) =>
    isViewer
      ? t('timeline.youLostSoldiers', { count, dead: toLocale(count, locale) })
      : t('timeline.playerLostSoldiers', {
          count,
          player: playerName,
          dead: toLocale(count, locale),
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
    t('timeline.goldPillaged', {
      gold: formatGold(stats.pillagedGold, locale),
    }),
    t('timeline.fortDamage', { damage: toLocale(fortDamage, locale) }),
    lossLine(isViewerAttacker, attackerPlayer.display_name, attackerLossCount),
    lossLine(isViewerDefender, defenderPlayer.display_name, defenderLossCount),
    // Dungeon captives (#210): each side reads its own line.
    ...(isViewerAttacker && captivesTaken > 0
      ? [
          t('timeline.captivesTaken', {
            count: captivesTaken,
            taken: toLocale(captivesTaken, locale),
          }),
        ]
      : []),
    ...(isViewerDefender && captivesTaken > 0
      ? [
          t('timeline.troopsTakenCaptive', {
            count: captivesTaken,
            taken: toLocale(captivesTaken, locale),
          }),
        ]
      : []),
    // Undead reanimation (#211): only the viewer's own fallen rise again.
    ...((isViewerAttacker || isViewerDefender) && reanimatedUnits > 0
      ? [
          t('timeline.reanimatedUnits', {
            count: reanimatedUnits,
            risen: toLocale(reanimatedUnits, locale),
          }),
        ]
      : []),
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
        <ReportHeader
          banner={{
            tone: isPlayerWinner ? 'green' : 'red',
            title:
              isViewerAttacker || isViewerDefender
                ? t(isPlayerWinner ? 'report.victory' : 'report.defeat')
                : t(
                    isAttackerWinner
                      ? 'report.attackerVictory'
                      : 'report.defenderVictory',
                  ),
            subtitle: t('report.winner', {
              player: isAttackerWinner
                ? attackerPlayer.display_name
                : defenderPlayer.display_name,
            }),
          }}
          attacker={{
            player: attackerPlayer,
            side: 'attacker',
            role: t('battleReport.attacker'),
            levelLabel: t('battleReport.level', {
              level: getLevelFromXP(stats.startOfAttack.Attacker.experience),
            }),
            levelTo: attackerLevelChange?.to,
            avatarAlt: t('battleReport.attackerAvatar'),
            profileLabel: allowAttackerProfile
              ? t('battleReport.viewProfile', {
                  player: attackerPlayer?.display_name,
                })
              : undefined,
          }}
          defender={{
            player: defenderPlayer,
            side: 'defender',
            role: t('battleReport.defender'),
            levelLabel: t('battleReport.level', {
              level: getLevelFromXP(stats.startOfAttack.Defender.experience),
            }),
            levelTo: defenderLevelChange?.to,
            avatarAlt: t('battleReport.defenderAvatar'),
            profileLabel: allowDefenderProfile
              ? t('battleReport.viewProfile', {
                  player: defenderPlayer?.display_name,
                })
              : undefined,
          }}
          band={{
            label: t('battleReport.battleId'),
            reportId: battle.id,
            actions: (isViewerAttacker || isViewerDefender) && (
              <Button onClick={toggleModal} size="md" fullWidth px="xs">
                {isViewerAttacker
                  ? t('battleReport.attackAgain')
                  : t('battleReport.attackBack')}
              </Button>
            ),
          }}
        />

        {(isViewerAttacker || isViewerDefender) && (
          <Modal
            isOpen={isOpen}
            toggleModal={toggleModal}
            profileID={isViewerAttacker ? defenderPlayer.id : attackerPlayer.id}
            targetName={
              isViewerAttacker
                ? defenderPlayer.display_name
                : attackerPlayer.display_name
            }
          />
        )}

        <BattleStatStrip
          stats={[
            {
              label: t('battleReport.goldPillaged'),
              value: isAttackerWinner
                ? formatGold(stats.pillagedGold, locale)
                : '0',
              tone: 'gold',
            },
            {
              label: t('battleReport.fortDamage'),
              value: toLocale(fortDamage, locale),
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

        <GarrisonFatigueNotice percent={garrisonFatigue} />

        {isViewerAttacker && stats.netPillageGold !== undefined && (
          <Text size="sm" ta="center" mt="sm">
            {t('battleReport.pillageDeductions', {
              contribution: formatGold(
                stats.forcePillageContribution ?? 0,
                locale,
              ),
              repayment: formatGold(stats.goldLoanRepayment ?? 0, locale),
              net: formatGold(stats.netPillageGold, locale),
            })}
          </Text>
        )}
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
                      fontFamily: 'MedievalSharp, serif',
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
                            fontFamily: 'MedievalSharp, serif',
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
                    <Group justify="space-between" gap="xs">
                      <Text
                        style={{
                          fontFamily: 'MedievalSharp, serif',
                          color: '#e8d39a',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {t('battleReport.spoilsOfWar')}
                      </Text>
                      <BattleGameEventContext value={stats.gameEvents} />
                    </Group>

                    <SimpleGrid cols={2} spacing="xs" mt="sm">
                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {t('battleReport.gold')}
                        </Text>
                        <Text fw={700} c="#f7d98b">
                          {isAttackerWinner
                            ? formatGold(stats.pillagedGold, locale)
                            : '0'}
                        </Text>
                      </Box>

                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {t('battleReport.fortDamage')}
                        </Text>
                        <Text fw={700} c="red.4">
                          {toLocale(fortDamage, locale)}
                        </Text>
                      </Box>

                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {t('battleReport.attackerXp')}
                        </Text>
                        <Text fw={700}>
                          {toLocale(xpEarned.attacker, locale)}
                        </Text>
                      </Box>

                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {t('battleReport.defenderXp')}
                        </Text>
                        <Text fw={700}>
                          {toLocale(xpEarned.defender, locale)}
                        </Text>
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
                        fontFamily: 'MedievalSharp, serif',
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
