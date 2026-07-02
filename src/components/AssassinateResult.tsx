import { faUserSecret } from '@fortawesome/free-solid-svg-icons';
import {
  Box,
  Button,
  Grid,
  Space,
  Stack,
  Text,
  useMantineTheme,
} from '@mantine/core';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useState } from 'react';

import { getAssetPath } from '@/utils/utilities';

import { GameCard } from './game/GameCard';
import Modal from './modal';
import SpyMissionsModal from './spyMissionsModal';

const AssassinateResult = ({ battle, viewerID }) => {
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const [isSpyModalOpen, setIsSpyModalOpen] = useState(false);
  const [isAttackModalOpen, setIsAttackModalOpen] = useState(false);
  const isViewerAttacker = viewerID === attackerPlayer.id;
  const isAttackerWinner = winner === attackerPlayer.id;
  const theme = useMantineTheme();

  const toggleSpyModal = () => setIsSpyModalOpen((v) => !v);
  const toggleAttackModal = () => setIsAttackModalOpen((v) => !v);

  const unitToAttack = () => {
    switch (stats.spyResults.unit) {
      case 'CITIZEN/WORKERS':
        return 'Citizens and Workers';
      case 'OFFENSE':
        return 'Offensive Units';
      case 'DEFENSE':
        return 'Defensive Units';
      default:
        return 'units';
    }
  };

  const summaryLines = [
    `Battle ID: ${battle.id}`,
    isViewerAttacker
      ? `You sent ${stats.spyResults.spiesSent} ${stats.spyResults.spiesSent > 1 ? 'spies' : 'spy'} to ${defenderPlayer.display_name}`
      : '',
    `${isViewerAttacker ? 'You were' : `${attackerPlayer.display_name} was`} ${isAttackerWinner && stats.spyResults.unitsKilled > 0 ? 'successful' : 'unsuccessful.'}`,
    `Your spies were tasked with killing as many ${unitToAttack()} as possible.`,
    isAttackerWinner && stats.spyResults.unitsKilled > 0
      ? `You successfully killed ${stats.spyResults.unitsKilled} ${unitToAttack()}.`
      : 'No units were killed.',
    stats.spyResults.spiesLost > 0
      ? `${stats.spyResults.spiesLost} of your spies were lost in the attempt.`
      : 'All of your spies returned safely.',
  ].filter((line) => line);

  const sentence = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };
  const letter = { hidden: { opacity: 0 }, visible: { opacity: 1 } };

  return (
    <GameCard title="Assassination Report" icon={faUserSecret}>
      <Grid grow gutter="lg">
        <Grid.Col span={{ base: 12, md: 5 }} style={{ textAlign: 'center' }}>
          <Text size="xl" fw={700}>
            {attackerPlayer?.display_name}
          </Text>
          <Image
            src={getAssetPath('shields', '150x150', attackerPlayer?.race)}
            alt="attacker avatar"
            width={150}
            height={150}
            style={{ margin: 'auto' }}
          />
        </Grid.Col>
        <Grid.Col
          span={{ base: 12, md: 2 }}
          style={{ textAlign: 'center', alignSelf: 'center' }}
        >
          <Text size="lg" fw="bold" color={isAttackerWinner ? 'green' : 'red'}>
            {isAttackerWinner ? 'Success' : 'Failure'}
          </Text>
          <Space h="md" />
          {isViewerAttacker && (
            <Stack align="center" gap="xs">
              <Button size="xs" onClick={toggleSpyModal}>
                Send More Spies
              </Button>
              <Button size="xs" onClick={toggleAttackModal}>
                Attack
              </Button>
            </Stack>
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }} style={{ textAlign: 'center' }}>
          <Text size="xl" fw={700}>
            {defenderPlayer?.display_name}
          </Text>
          <Image
            src={getAssetPath('shields', '150x150', defenderPlayer?.race)}
            alt="defender avatar"
            width={150}
            height={150}
            style={{ margin: 'auto' }}
          />
        </Grid.Col>
      </Grid>

      <GameCard title="Mission Log" goldAccent={false}>
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

      <SpyMissionsModal
        isOpen={isSpyModalOpen}
        toggleModal={toggleSpyModal}
        defenderID={defenderPlayer?.id}
      />
      <Modal
        isOpen={isAttackModalOpen}
        toggleModal={toggleAttackModal}
        profileID={defenderPlayer.id}
      />
    </GameCard>
  );
};

export default AssassinateResult;
