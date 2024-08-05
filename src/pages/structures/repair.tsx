import { useEffect, useState } from 'react';
import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import toLocale from '@/utils/numberFormatting';
import { Badge, Box, Button, Center, Group, NumberInput, Paper, rem, RingProgress, SimpleGrid, Space, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import Alert from '@/components/alert';
import { BiCoinStack, BiSolidBank } from 'react-icons/bi';

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
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 2 }}>

        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between">
            <Text size="lg" fw={'bold'} c="dimmed">
              Gold In Hand
            </Text>
            <ThemeIcon c='white'>
              <BiCoinStack style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </Group>
          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{parseInt(user?.gold?.toString() ?? "0").toLocaleString()}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between">
            <Text size="lg" fw={'bold'} c="dimmed">
              Banked Gold
            </Text>
            <ThemeIcon c='white'>
              <BiSolidBank style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </Group>
          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{parseInt(user?.goldInBank?.toString() ?? "0").toLocaleString()}</Text>
          </Group>
        </Paper>
      </SimpleGrid>
      <Space h="md" />

      <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Paper withBorder radius="md" p="md" className="w-full mb-4"> 
          <Group position="apart" align="flex-start">
            <Stack spacing="xs">
              <Group position="apart" align="center" spacing="xs">
                <Text fw={700} size="xl" className='font-medieval'>
                  {fortification?.name}
                </Text>
                <Badge color="brand" variant={remainingHitpoints === 0 ? 'default' : 'filled'} >
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
              <Button p={'10'} fs={'10px'} fz={'lg'} h={'50%'} color='secondary' size='compact-xs'>
              <Text size="xs" color="light" onClick={()=>setRepairPoints(remainingHitpoints)}>
                Max: {remainingHitpoints}
                </Text>
              </Button>
              <Button color="brand" fs={'10px'} onClick={handleRepair}>Repair</Button>
              <Button color='brand.9' fs={'10px'} onClick={()=>setRepairPoints(0)}>Reset</Button>
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
