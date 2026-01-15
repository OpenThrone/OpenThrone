import { faArrowRight, faUniversity } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Badge,
  Button,
  Center,
  Group,
  NumberInput,
  RingProgress,
  SimpleGrid,
  Space,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { BiCoinStack, BiHistory, BiWrench } from 'react-icons/bi';

import { GameCard } from '@/components/game/GameCard';
import { StatGrid } from '@/components/game/StatGrid';
import { StyledTable } from '@/components/game/StyledTable';
import MainArea from '@/components/MainArea';
import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';
import toLocale from '@/utils/numberFormatting';

const Repair = () => {
  const { user, forceUpdate } = useUser();
  const [fortification, setFortification] = useState(null);
  const [repairPoints, setRepairPoints] = useState(0);
  const [history, setHistory] = useState([]);
  const [isRepairing, setIsRepairing] = useState(false);

  useEffect(() => {
    if (user?.fortLevel) {
      setFortification(
        Fortifications.find((fort) => fort.level === user.fortLevel),
      );
    }
    if (user) {
      fetch(`/api/bank/history?fortification=true`)
        .then((res) => res.json())
        .then((data) => setHistory(data.rows))
        .catch((err) => logError('Error fetching bank history:', err));
    }
  }, [user]);

  const handleRepair = async (amount: number) => {
    if (isRepairing || amount <= 0) return;
    setIsRepairing(true);
    try {
      const response = await fetch('/api/account/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repairPoints: amount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Repair failed');
      alertService.success(data.message || 'Repair successful!');
      forceUpdate();
      setRepairPoints(0);
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setIsRepairing(false);
    }
  };

  if (!user || !fortification) {
    return (
      <MainArea title="Repair Fortification">
        <GameCard title="Repair Fortification">
          <Text>Loading...</Text>
        </GameCard>
      </MainArea>
    );
  }

  const remainingHitpoints = fortification.hitpoints - user.fortHitpoints;
  const healthPercentage = Math.floor(
    (user.fortHitpoints / fortification.hitpoints) * 100,
  );

  const statItems = [
    {
      label: 'Gold In Hand',
      value: toLocale(user.gold, user.locale),
      icon: <BiCoinStack size={18} />,
    },
    {
      label: 'Banked Gold',
      value: toLocale(user.goldInBank, user.locale),
      icon: faUniversity,
    },
  ];

  const historyRows = history.map((entry) => (
    <Table.Tr key={entry.id}>
      <Table.Td>{new Date(entry.date_time).toLocaleString()}</Table.Td>
      <Table.Td>+{entry.stats.actualRepairAmount}</Table.Td>
      <Table.Td>
        {entry.stats.currentFortHP} <FontAwesomeIcon icon={faArrowRight} />{' '}
        {entry.stats.newFortHP}
      </Table.Td>
      <Table.Td>-{toLocale(entry.gold_amount, user.locale)}</Table.Td>
    </Table.Tr>
  ));

  return (
    <MainArea title="Repair Fortification">
      <StatGrid title="Fortification Resources" stats={statItems} />
      <Space h="md" />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <GameCard
          title="Fortification Status"
          icon={faArrowRight}
          goldAccent={remainingHitpoints > 0}
        >
          <Group justify="space-between">
            <Stack gap="xs">
              <Text size="xl" fw={700}>
                {fortification.name}
              </Text>
              <Badge color={remainingHitpoints > 0 ? 'red' : 'green'}>
                {remainingHitpoints > 0 ? 'Damaged' : 'Fully Repaired'}
              </Badge>
            </Stack>
            <RingProgress
              sections={[
                {
                  value: healthPercentage,
                  color: healthPercentage < 50 ? 'red' : 'yellow',
                },
              ]}
              label={
                <Center>
                  <Text>{healthPercentage}%</Text>
                </Center>
              }
            />
          </Group>
          <Text mt="md">
            HP: {user.fortHitpoints.toLocaleString()} /{' '}
            {fortification.hitpoints.toLocaleString()}
          </Text>
        </GameCard>
        <GameCard title="Repair" icon={<BiWrench size={16} />}>
          <NumberInput
            label="Amount to Repair"
            value={repairPoints}
            onChange={(value) =>
              setRepairPoints(typeof value === 'number' ? value : 0)
            }
            min={0}
            max={remainingHitpoints}
          />
          <Text size="sm" c="dimmed" mt="xs">
            Cost:{' '}
            {toLocale(
              repairPoints * fortification.costPerRepairPoint,
              user.locale,
            )}{' '}
            gold
          </Text>
          <Group mt="md">
            <Button
              onClick={() => handleRepair(repairPoints)}
              disabled={repairPoints <= 0 || isRepairing}
            >
              Repair
            </Button>
            <Button
              onClick={() => handleRepair(remainingHitpoints)}
              disabled={remainingHitpoints <= 0 || isRepairing}
            >
              Repair All
            </Button>
          </Group>
        </GameCard>
      </SimpleGrid>
      <Space h="md" />
      <GameCard title="Repair History" icon={<BiHistory size={16} />}>
        <StyledTable headers={['Date', 'HP Repaired', 'HP Change', 'Cost']}>
          {historyRows}
        </StyledTable>
      </GameCard>
    </MainArea>
  );
};

export default Repair;
