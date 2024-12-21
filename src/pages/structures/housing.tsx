import { Fortifications, HouseUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { Group, Paper, rem, ThemeIcon, Text, SimpleGrid, Center, RingProgress, Space, Stack } from '@mantine/core';
import { BiCoinStack, BiSolidBank } from 'react-icons/bi';
import classes from './housing.module.css';
import { useEffect, useState } from 'react';
import toLocale from '@/utils/numberFormatting';
import Alert from '@/components/alert';
import MainArea from '@/components/MainArea';

const Housing = (props) => {
  const { user } = useUser();
  const [mounted, setMounted] = useState(false); // Track if component is mounted
  const [houseLevel, setHouseLevel] = useState(1);
  const [gold, setGold] = useState(BigInt(0));
  const [goldInBank, setGoldInBank] = useState(BigInt(0));
  const [citizens, setCitizens] = useState(0);
  const [citizensDaily, setCitizensDaily] = useState(0);
  const [houseUpgrade, setHouseUpgrade] = useState(HouseUpgrades[houseLevel]);
  const [nextUpgrade, setNextUpgrade] = useState(HouseUpgrades[houseLevel + 1]);

  useEffect(() => {
    setMounted(true); // Set mounted to true when component mounts
  }, []);

  useEffect(() => {
    if (!user) return;
    setHouseUpgrade(HouseUpgrades[user.houseLevel]);
    setNextUpgrade(HouseUpgrades[user.houseLevel + 1]);
    setHouseLevel(user.houseLevel);
    setGold(user.gold);
    setGoldInBank(user.goldInBank);
    setCitizens(user.citizens);
    setCitizensDaily(HouseUpgrades[user.houseLevel].citizensDaily);
  }, [user]);

  if (!mounted) return null; // Render nothing on the server

  return (
    <MainArea title='Housing'>
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
          <Group align="flex-start">
            <Stack spacing="xs">
                
              <Text>
                <Text fw={700} size="xl" className='font-medieval'>
                  {houseUpgrade.name}
                </Text>
                <Text size="xs" color='dimmed'>
                  Housing brings new citizens to your fortification every day.
                </Text>
              </Text>
              
              <Text>
              <Text size="sm" color="dimmed">
                New Citizens Per Day: <Text component="span" color="lightgray">{houseUpgrade.citizensDaily}</Text>
                </Text>
                <Text size='xs' color='dimmed'>
                  You will gain the above citizens every day at midnight OT time.
                  </Text>
              </Text>
            </Stack>
          </Group>
        </Paper>
        <Paper withBorder radius="md" p="md" className="w-full mb-4">
          <Group align="flex-start">
            <Stack spacing="xs">
              <Text>
                <Text fw={700} size="xl" className='font-medieval'>
                  <span color='dimmed'>Next Upgrade:</span> {nextUpgrade.name}
                </Text>
                <Text size="xs" color='dimmed'>
                  Upgrade your housing to bring more citizens to your fortification every day.
                </Text>
              </Text>
              <Text size="sm" color="dimmed">
                New Citizens Per Day: <Text component="span" color="lightgray">{nextUpgrade.citizensDaily}</Text>
              </Text>
              <Text size="sm" color="dimmed">
                Fortification Required: <Text component="span" color="lightgray">{Fortifications[nextUpgrade.fortLevel].name}</Text>
              </Text>
              <Text size="sm" color="dimmed">
                Cost: <Text component="span" color="lightgray">{nextUpgrade.cost} Gold</Text>
              </Text>
            </Stack>
          </Group>
        </Paper>
      </SimpleGrid>
    </MainArea>
  );
};

export default Housing;
