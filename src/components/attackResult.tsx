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
import { getAssetPath, getAvatarSrc, getLevelFromXP } from '@/utils/utilities';

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
    return toLocale(
      unitsArray
        .filter((unit) => unit.type === type)
        .reduce((acc, curr) => acc + curr.quantity, 0),
    );
  };

  const summaryLines = [
    `Battle ID: ${battle.id}`,
    `${isViewerAttacker ? 'You' : attackerPlayer.display_name} attacked ${isViewerDefender ? 'You' : defenderPlayer.display_name}`,
    t('report.attackLine', {
      soldiers: countUnitsOfType(stats.startOfAttack.Attacker.units, 'OFFENSE'),
    }),
    isViewerDefender
      ? t('report.yourCounterLine', { dead: attackerTotalLosses })
      : t('report.counterLine', {
          player: defenderPlayer.display_name,
          dead: attackerTotalLosses,
        }),
    `${isPlayerWinner ? 'You' : isAttackerWinner ? attackerPlayer.display_name : defenderPlayer.display_name} won the battle`,
    `${attackerPlayer.display_name} earned ${toLocale(JSON.parse(stats.xpEarned).attacker)} XP`,
    `${defenderPlayer.display_name} earned ${toLocale(JSON.parse(stats.xpEarned).defender)} XP`,
    // Loot accrues on the turns the attacker won even when the verdict is a loss.
    `Gold Pillaged: ${toLocale(stats.pillagedGold ?? 0)}`,
    `Fort Damage Dealt by Attacker: ${toLocale(fortDamage)}`,
    t('report.lossLine', {
      player: isViewerAttacker ? t('report.you') : attackerPlayer.display_name,
      dead: attackerTotalLosses,
    }),
    t('report.lossLine', {
      player: isViewerDefender ? t('report.you') : defenderPlayer.display_name,
      dead: defenderTotalLosses,
    }),
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
    <GameCard title="Battle Report" icon={faScroll}>
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
                    ? `View ${attackerPlayer?.display_name} profile`
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
                    alt="attacker avatar"
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
                    Lvl{' '}
                    {getLevelFromXP(stats.startOfAttack.Attacker.experience)}
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
                    Attacker
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
                  Battle ID
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
                  {isViewerAttacker ? 'Attack Again' : 'Attack Back'}
                </Button>

                <Modal
                  isOpen={isOpen}
                  toggleModal={toggleModal}
                  profileID={
                    isViewerAttacker ? defenderPlayer.id : attackerPlayer.id
                  }
                />
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
                    ? `View ${defenderPlayer?.display_name} profile`
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
                    Lvl{' '}
                    {getLevelFromXP(stats.startOfAttack.Defender.experience)}
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
                    Defender
                  </Text>
                </Box>

                <Box
                  className={`${classes.defenderAvatar} ${classes.portrait}`}
                >
                  <FramedAvatar
                    frameSrc={frameSrc}
                    src={defenderAvatarSrc}
                    alt="defender avatar"
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
              label: 'Gold Pillaged',
              value: isAttackerWinner ? toLocale(stats.pillagedGold) : '0',
              tone: 'gold',
            },
            {
              label: 'Fort Damage',
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
                    Battle Timeline
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
                      Spoils of War
                    </Text>

                    <SimpleGrid cols={2} spacing="xs" mt="sm">
                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          Gold
                        </Text>
                        <Text fw={700} c="#f7d98b">
                          {isAttackerWinner
                            ? toLocale(stats.pillagedGold)
                            : '0'}
                        </Text>
                      </Box>

                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          Fort Damage
                        </Text>
                        <Text fw={700} c="red.4">
                          {toLocale(fortDamage)}
                        </Text>
                      </Box>

                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          Attacker XP
                        </Text>
                        <Text fw={700}>
                          {toLocale(JSON.parse(stats.xpEarned).attacker)}
                        </Text>
                      </Box>

                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          Defender XP
                        </Text>
                        <Text fw={700}>
                          {toLocale(JSON.parse(stats.xpEarned).defender)}
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
                        fontFamily: 'Cinzel, MedievalSharp, serif',
                        color: '#e8d39a',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Casualties
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
