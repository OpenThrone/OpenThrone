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
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';

import { PlayerRace } from '@/types/typings';
import { toLocale } from '@/utils/numberFormatting';
import { getAssetPath, getAvatarSrc, getLevelFromXP } from '@/utils/utilities';

import { BattleLedger } from './BattleLedger';
import { BattleResultBanner } from './BattleResultBanner';
import { BattleStatStrip } from './BattleStatStrip';
import { FramedAvatar } from './FramedAvatar';
import { GameCard } from './game/GameCard';
import Modal from './modal';

const AttackResults = ({ battle, viewerID }) => {
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const isViewerAttacker = viewerID === attackerPlayer.id;
  const isViewerDefender = viewerID === defenderPlayer.id;
  const isPlayerWinner = winner === viewerID;
  const isAttackerWinner = winner === attackerPlayer.id;
  const allowAttackerProfile = !isViewerAttacker;
  const allowDefenderProfile = !isViewerDefender;
  const [isOpen, setIsOpen] = useState(false);
  const theme = useMantineTheme();

  const toggleModal = () => setIsOpen(!isOpen);

  const totalLosses = (losses: string | { total?: number }): number => {
    try {
      const parsedLosses =
        typeof losses === 'string' ? JSON.parse(losses) : losses;
      return parsedLosses.total ?? 0;
    } catch {
      return 0;
    }
  };

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
    `${isViewerAttacker ? 'Your' : `${attackerPlayer.display_name}'s`} ${countUnitsOfType(stats.startOfAttack.Attacker.units, 'OFFENSE')} soldiers did ${toLocale(stats.attackerDamageDealt)} damage`,
    `${isViewerDefender ? 'Your' : `${defenderPlayer.display_name}'s`} counter killed ${toLocale(stats.defenderDamageDealt)} attackers`,
    `${isPlayerWinner ? 'You' : isAttackerWinner ? attackerPlayer.display_name : defenderPlayer.display_name} won the battle`,
    `${attackerPlayer.display_name} earned ${toLocale(JSON.parse(stats.xpEarned).attacker)} XP`,
    `${defenderPlayer.display_name} earned ${toLocale(JSON.parse(stats.xpEarned).defender)} XP`,
    `Gold Pillaged: ${isAttackerWinner ? toLocale(stats.pillagedGold) : 0}`,
    `Fort Damage Dealt by Attacker: ${stats.forthpAtStart - stats.forthpAtEnd}`,
    `Total Units Lost by Attacker: ${attackerTotalLosses}`,
    `Total Units Lost by Defender: ${defenderTotalLosses}`,
  ];

  const sentence = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { delayChildren: 1, staggerChildren: 0.06 },
    },
  };
  const letter = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.3 } },
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
          tone={isAttackerWinner ? 'green' : 'red'}
          title={isAttackerWinner ? 'Victory' : 'Defeat'}
          subtitle={
            isAttackerWinner
              ? 'Your forces broke through the enemy defenses.'
              : 'Your forces were driven from the field.'
          }
        />

        <Box
          style={{
            position: 'relative',
            padding: '8px 28px 18px',
            minHeight: 286,
            display: 'flex',
            alignItems: 'center',
            marginTop: -26,
          }}
        >
          <Box
            aria-hidden
            style={{
              position: 'absolute',
              left: '8%',
              right: '8%',
              top: '52%',
              height: 1,
              background:
                'linear-gradient(90deg, transparent, rgba(201,166,89,0.24), transparent)',
              pointerEvents: 'none',
            }}
          />

          <Grid align="center" gutter="xl" style={{ width: '100%' }}>
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Box
                component={allowAttackerProfile ? Link : 'div'}
                href={allowAttackerProfile ? attackerProfileHref : undefined}
                aria-label={
                  allowAttackerProfile
                    ? `View ${attackerPlayer?.display_name} profile`
                    : undefined
                }
                style={{
                  display: 'grid',
                  gridTemplateColumns: '240px minmax(0, 1fr)',
                  alignItems: 'center',
                  gap: 22,
                  textDecoration: 'none',
                  color: 'inherit',
                  cursor: allowAttackerProfile ? 'pointer' : 'default',
                }}
              >
                <FramedAvatar
                  frameSrc={attackerFrameSrc}
                  src={attackerAvatarSrc}
                  alt="attacker avatar"
                  size={240}
                  insetX={40}
                  insetY={58}
                  objectFit="cover"
                />

                <Box>
                  <Text
                    style={{
                      fontFamily: 'MedievalSharp, serif',
                      fontSize: 'clamp(1.0rem, 1.8vw, 1.6rem)',
                      lineHeight: 1.05,
                      color: '#f7d98b',
                      textShadow: '0 2px 3px rgba(0,0,0,0.8)',
                    }}
                  >
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

            <Grid.Col span={{ base: 12, md: 2 }}>
              <Stack
                align="center"
                gap={8}
                style={{
                  minWidth: 180,
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
                  style={{
                    minWidth: 170,
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

            <Grid.Col span={{ base: 12, md: 5 }}>
              <Box
                component={allowDefenderProfile ? Link : 'div'}
                href={allowDefenderProfile ? defenderProfileHref : undefined}
                aria-label={
                  allowDefenderProfile
                    ? `View ${defenderPlayer?.display_name} profile`
                    : undefined
                }
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 240px',
                  alignItems: 'center',
                  gap: 22,
                  textDecoration: 'none',
                  color: 'inherit',
                  cursor: allowDefenderProfile ? 'pointer' : 'default',
                  textAlign: 'right',
                }}
              >
                <Box>
                  <Text
                    style={{
                      fontFamily: 'MedievalSharp, serif',
                      fontSize: 'clamp(1.6rem, 2.4vw, 2.2rem)',
                      lineHeight: 1.05,
                      color: '#f7d98b',
                      textShadow: '0 2px 3px rgba(0,0,0,0.8)',
                    }}
                  >
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
            </Grid.Col>
          </Grid>
        </Box>

        <BattleStatStrip
          stats={[
            {
              label: 'Attack Damage',
              value: toLocale(stats.attackerDamageDealt),
              tone: 'normal',
            },
            {
              label: 'Counter Kills',
              value: toLocale(stats.defenderDamageDealt),
              tone: 'normal',
            },
            {
              label: 'Gold Pillaged',
              value: isAttackerWinner ? toLocale(stats.pillagedGold) : '0',
              tone: 'gold',
            },
            {
              label: 'Fort Damage',
              value: toLocale(stats.forthpAtStart - stats.forthpAtEnd),
              tone: 'bad',
            },
            {
              label: 'Attacker Losses',
              value: attackerTotalLosses,
              tone: isAttackerWinner ? 'good' : 'bad',
            },
            {
              label: 'Defender Losses',
              value: defenderTotalLosses,
              tone: isAttackerWinner ? 'bad' : 'good',
            },
          ]}
        />

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

              <Grid.Col span={{ base: 12, md: 5 }}>
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
                          {toLocale(stats.forthpAtStart - stats.forthpAtEnd)}
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
                          Attacker Lost
                        </Text>
                        <Text
                          fw={700}
                          c={isAttackerWinner ? 'green.4' : 'red.4'}
                        >
                          {attackerTotalLosses}
                        </Text>
                      </Box>

                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase">
                          Defender Lost
                        </Text>
                        <Text
                          fw={700}
                          c={isAttackerWinner ? 'red.4' : 'green.4'}
                        >
                          {defenderTotalLosses}
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
