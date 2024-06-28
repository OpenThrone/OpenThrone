import { useEffect, useState } from 'react';
import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import toLocale from '@/utils/numberFormatting';
import { Badge, Box, Button, Center, Group, NumberInput, Paper, RingProgress, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';

const Repair = (props) => {
  const { user, forceUpdate } = useUser();
  const [fortification, setFortification] = useState(Fortifications[0]);
  const [repairPoints, setRepairPoints] = useState(0);

  useEffect(() => {
    if (user?.fortLevel) {
      setFortification(Fortifications.find((fort) => fort.level === user.fortLevel));
    }
  }, [user?.fortLevel]);

  const handleRepair = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/account/repair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repairPoints }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('Error repairing:', data.error);
        return;
      }

      const data = await response.json();
      console.log('Success:', data);
      forceUpdate();
    } catch (error) {
      console.error('Fetch error:', error);
    }
  };

  const handleRepairAll = async () => {
    const maxRepairPoints = (fortification?.hitpoints ?? 0) - (user?.fortHitpoints ?? 0);
    if (maxRepairPoints <= 0) return;
    try {
      const response = await fetch('/api/account/repair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repairPoints: maxRepairPoints }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('Error repairing all:', data.error);
        return;
      }

      const data = await response.json();
      console.log('Success:', data);
      forceUpdate();
    } catch (error) {
      console.error('Fetch error:', error);
    }
  };

  const remainingHitpoints = fortification?.hitpoints - user?.fortHitpoints;
  const repairCost = repairPoints * fortification?.costPerRepairPoint;

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Fort Repair</h2>
      <div className="my-5 flex justify-around">
        <p className="mb-0">
          Gold On Hand: <span>{toLocale(user?.gold, user?.locale)}</span>
        </p>
        <p className="mb-0">
          Banked Gold: <span>{toLocale(user?.goldInBank, user?.locale)}</span>
        </p>
      </div>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Paper withBorder radius="md" p="md" className="w-full mb-4"> 
          <Group position="apart" align="flex-start">
            <Stack spacing="xs">
              <Group position="apart" align="center" spacing="xs">
                <Text fw={700} size="xl" className='font-medieval'>
                  {fortification?.name}
                </Text>
                <Badge color="blue" variant="filled">
                  {remainingHitpoints === 0 ? 'Fully Repaired' : 'Needs Repair'}
                </Badge>
              </Group>
              <Text size="sm" color="dimmed">
                Level: <Text component="span" color="lightgray">{fortification?.level}</Text>
              </Text>
              <Text size="sm" color="dimmed">
                Health: <Text component="span" color="lightgray">{user?.fortHitpoints} / {fortification?.hitpoints}</Text>
              </Text>
              <Text size="sm" color="dimmed">
                Defense Bonus: <Text component="span" color="lightgray">{fortification?.defenseBonusPercentage}%</Text>
              </Text>
              <Text size="sm" color="dimmed">
                Gold Per Turn: <Text component="span" color="lightgray">{fortification?.goldPerTurn}</Text>
              </Text>
              <Text size="sm" color="dimmed">
                Cost: <Text component="span" color="lightgray">{fortification?.cost} Gold</Text>
              </Text>
            </Stack>

            <RingProgress
              size={120}
              roundCaps
              thickness={8}
              sections={[{ value: ((fortification?.hitpoints - remainingHitpoints) / fortification?.hitpoints) * 100, color: 'red' }]}
              label={
                <Center>
                  <Text size="xl" className={'font-medieval'}>{Math.floor(((fortification?.hitpoints - remainingHitpoints) / fortification?.hitpoints) * 100)} %</Text>
                </Center>
              }
            />
          </Group>
        </Paper>
        <Paper withBorder radius="md" p="md" className="w-full mb-4">
          <Box>
            <Text size="xl" fw={500} className='font-medieval'>
              Repair Fortification
            </Text>
            <Box className="flex items-center space-x-4 mt-2">
              <NumberInput
                value={repairPoints}
                onChange={(e) => setRepairPoints(Number(e))}
                placeholder="Repair Points"
                className="w-32"
                max={remainingHitpoints}
                min={0}
                allowNegative={false}
              />
              <Text size="sm" color="dimmed" onClick={()=>setRepairPoints(remainingHitpoints)}>
                Max: {remainingHitpoints}
              </Text>
              <Button color="blue" fs={'10px'} onClick={handleRepair}>Repair</Button>
              <Button color='gray' onClick={()=>setRepairPoints(0)}>Reset</Button>
            </Box>
            <Text mt="xs" color="dimmed" size="sm">
              Repair Cost Per HP: <Text component="span" color="lightgray">{fortification?.costPerRepairPoint} Gold</Text>
            </Text>
            <Text mt="xs" color="dimmed" size="sm">
              Total Repair Cost: <Text component="span" color="lightgray">{toLocale(repairCost, user?.locale)} Gold</Text>
            </Text>
          </Box>
        </Paper>
      </SimpleGrid>
    </div>
  );
};

export default Repair;
