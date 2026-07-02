import { faBuilding } from '@fortawesome/free-solid-svg-icons';
import {
  Box,
  Button,
  Grid,
  Space,
  Stack,
  Text,
  useMantineTheme,
} from '@mantine/core';
import Image from 'next/image';
import { useState } from 'react';

import { getAssetPath, getLevelFromXP } from '@/utils/utilities';

import { GameCard } from './game/GameCard';
import Modal from './modal';
import SpyMissionsModal from './spyMissionsModal';

const InfiltrationResult = ({ battle, lastGenerated, viewerID }) => {
  const [isSpyModalOpen, setIsSpyModalOpen] = useState(false);
  const [isAttackModalOpen, setIsAttackModalOpen] = useState(false);
  const { attackerPlayer, defenderPlayer, winner, stats } = battle || {};
  const isViewerAttacker = viewerID === attackerPlayer?.id;
  const isAttackerWinner = winner === attackerPlayer?.id;
  const theme = useMantineTheme();

  const toggleSpyModal = () => setIsSpyModalOpen((v) => !v);
  const toggleAttackModal = () => setIsAttackModalOpen((v) => !v);

  const summaryLines = [
    `You sent ${stats.spyResults.spiesSent} ${stats.spyResults.spiesSent > 1 ? 'Infiltrators' : 'Infiltrator'} to attack ${defenderPlayer.display_name}'s Fort.`,
    `You were ${isAttackerWinner ? 'successful' : 'unsuccessful'} in your mission${isAttackerWinner ? ` and managed to cause ${stats.spyResults.fortDmg} damage to the fort` : ''}.`,
  ];

  return (
    <GameCard title="Infiltration Report" icon={faBuilding}>
      <Grid grow gutter="lg">
        <Grid.Col span={{ base: 12, md: 5 }} style={{ textAlign: 'center' }}>
          <Text size="xl" fw={700}>
            {attackerPlayer?.display_name}
          </Text>
          <Text c="dimmed">
            Level: {getLevelFromXP(stats.spyResults.attacker.experience)}
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
          <Text c="dimmed">
            Level: {getLevelFromXP(stats.spyResults.defender.experience)}
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
            color: theme.colors.gray[4],
          }}
        >
          {summaryLines.map((line, index) => (
            <Text key={index}>{line}</Text>
          ))}
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
      <Text size="xs" c="dimmed" ta="center" mt="md">
        Report generated: {new Date(lastGenerated).toLocaleString()}
      </Text>
    </GameCard>
  );
};

export default InfiltrationResult;
