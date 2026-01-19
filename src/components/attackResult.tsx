import { faScroll } from '@fortawesome/free-solid-svg-icons';
import {
  Box,
  Button,
  Grid,
  Group,
  Space,
  Text,
  useMantineTheme,
} from '@mantine/core';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { PlayerRace } from '@/types/typings';
import toLocale from '@/utils/numberFormatting';
import { getAssetPath, getAvatarSrc, getLevelFromXP } from '@/utils/utilities';

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

  const totalLosses = (losses: string): number => {
    try {
      const parsedLosses = JSON.parse(losses);
      return Object.values(parsedLosses.units || {}).reduce(
        (acc: number, curr: any) => acc + curr,
        0,
      ) as number;
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
    `${isViewerDefender ? 'Your' : `${defenderPlayer.display_name}'s`} countered with ${toLocale(stats.defenderDamageDealt)} damage`,
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
      <Grid grow gutter="lg">
        <Grid.Col span={{ base: 12, md: 5 }} style={{ textAlign: 'center' }}>
          <Box
            component={allowAttackerProfile ? Link : 'div'}
            href={allowAttackerProfile ? attackerProfileHref : undefined}
            aria-label={
              allowAttackerProfile
                ? `View ${attackerPlayer?.display_name} profile`
                : undefined
            }
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textDecoration: 'none',
              color: 'inherit',
              cursor: allowAttackerProfile ? 'pointer' : 'default',
            }}
          >
            <Group
              gap={8}
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                border: '1px solid #1f2b3b',
                background: 'linear-gradient(180deg, #121a24, #0b1118)',
                fontFamily: 'MedievalSharp, serif',
              }}
            >
              <Text size="xl" fw={700} style={{ letterSpacing: 0.5 }}>
                {attackerPlayer?.display_name}
              </Text>
              <Text size="xs" c="dimmed" tt="uppercase">
                Lvl {getLevelFromXP(stats.startOfAttack.Attacker.experience)}
              </Text>
            </Group>
            <Box style={{ marginTop: -8 }}>
              <FramedAvatar
                frameSrc={attackerFrameSrc}
                src={attackerAvatarSrc}
                alt="attacker avatar"
                size={380}
                insetX={60}
                insetY={90}
              />
            </Box>
          </Box>
        </Grid.Col>

        <Grid.Col
          span={{ base: 12, md: 2 }}
          style={{ textAlign: 'center', alignSelf: 'center' }}
        >
          <Text size="lg" fw="bold" color={isAttackerWinner ? 'green' : 'red'}>
            {isAttackerWinner ? 'Victory' : 'Defeat'}
          </Text>
          <Space h="md" />
          <Button onClick={toggleModal}>
            {isViewerAttacker ? 'Attack Again' : 'Attack Back'}
          </Button>
          <Modal
            isOpen={isOpen}
            toggleModal={toggleModal}
            profileID={isViewerAttacker ? defenderPlayer.id : attackerPlayer.id}
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }} style={{ textAlign: 'center' }}>
          <Box
            component={allowDefenderProfile ? Link : 'div'}
            href={allowDefenderProfile ? defenderProfileHref : undefined}
            aria-label={
              allowDefenderProfile
                ? `View ${defenderPlayer?.display_name} profile`
                : undefined
            }
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textDecoration: 'none',
              color: 'inherit',
              cursor: allowDefenderProfile ? 'pointer' : 'default',
            }}
          >
            <Group
              gap={8}
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                border: '1px solid #1f2b3b',
                background: 'linear-gradient(180deg, #121a24, #0b1118)',
                fontFamily: 'MedievalSharp, serif',
              }}
            >
              <Text size="xl" fw={700} style={{ letterSpacing: 0.5 }}>
                {defenderPlayer?.display_name}
              </Text>
              <Text size="xs" c="dimmed" tt="uppercase">
                Lvl {getLevelFromXP(stats.startOfAttack.Defender.experience)}
              </Text>
            </Group>
            <Box style={{ marginTop: -8 }}>
              <FramedAvatar
                frameSrc={frameSrc}
                src={defenderAvatarSrc}
                alt="defender avatar"
                size={380} // outer size
                insetX={60}
                insetY={90}
              />
            </Box>
          </Box>
        </Grid.Col>
      </Grid>

      <GameCard title="Battle Log" goldAccent={false}>
        <Box
          style={{
            backgroundColor: '#0f141a',
            borderRadius: '6px',
            border: '1px solid #1f2b3b',
            boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
            padding: '12px',
            textAlign: 'center',
            fontFamily: 'MedievalSharp, serif',
            color: theme.colors.gray[4],
          }}
        >
          <AnimatePresence>
            {summaryLines.map((line, i) => (
              <motion.p
                variants={sentence}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0 }}
                key={`${i}-log-line`}
                style={{ margin: 0 }}
              >
                {line.split('').map((char, index) => (
                  <motion.span key={`${char}-${index}`} variants={letter}>
                    {char}
                  </motion.span>
                ))}
              </motion.p>
            ))}
          </AnimatePresence>
        </Box>
      </GameCard>
    </GameCard>
  );
};

export default AttackResults;
