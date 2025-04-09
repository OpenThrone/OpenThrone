import { Fortifications, HouseUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { Group, rem, Text, SimpleGrid, Space, Stack, Button } from '@mantine/core';
import { BiCoinStack, BiSolidBank, BiHome, BiUpArrowAlt } from 'react-icons/bi';
import { useEffect, useState } from 'react';
import toLocale from '@/utils/numberFormatting';
import MainArea from '@/components/MainArea';
import ContentCard from '@/components/ContentCard';
import StatCard from '@/components/StatCard';
import buyUpgrade from '@/utils/buyStructureUpgrade';

const Housing = (props) => {
  const { user, forceUpdate } = useUser();
  const [mounted, setMounted] = useState(false);
  const [houseLevel, setHouseLevel] = useState(1);
  const [gold, setGold] = useState(BigInt(0));
  const [goldInBank, setGoldInBank] = useState(BigInt(0));
  const [citizens, setCitizens] = useState(0);
  const [citizensDaily, setCitizensDaily] = useState(0);
  const [houseUpgrade, setHouseUpgrade] = useState(HouseUpgrades[houseLevel]);
  const [nextUpgrade, setNextUpgrade] = useState(HouseUpgrades[houseLevel + 1]);
  const [isUpgrading, setIsUpgrading] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  const handleBuyUpgrade = async () => {
    if (isUpgrading) return;
    setIsUpgrading(true);
    
    try {
      await buyUpgrade('house');
      forceUpdate();
    } catch (error) {
      console.error('Failed to upgrade housing:', error);
    } finally {
      setIsUpgrading(false);
    }
  };

  if (!mounted) return null;

  const canUpgrade = user?.gold >= BigInt(nextUpgrade.cost) && user?.fortLevel >= nextUpgrade.fortLevel;
  
  return (
    <MainArea title='Housing'>
      {/* Resource Stats */}
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} className="mb-6">
        <StatCard 
          title="Gold In Hand"
          value={toLocale(user?.gold ?? 0)}
          icon={<BiCoinStack size={18} />}
        />
        <StatCard 
          title="Banked Gold"
          value={toLocale(user?.goldInBank ?? 0)}
          icon={<BiSolidBank size={18} />}
        />
        <StatCard 
          title="Citizens"
          value={toLocale(user?.citizens ?? 0)}
          subtitle={`+${citizensDaily} daily`} // not build yet
          icon={<BiHome size={18} />}
        />
      </SimpleGrid>

      <Space h="md" />

      {/* Current Housing */}
      <SimpleGrid cols={{ base: 1, md: 2 }} gap="xl">
        <ContentCard
          title="Current Housing"
          icon={<BiHome size={18} />}
          variant="default"
          titlePosition="left"
        >
          <Stack gap="md" className="p-2">
            <Text fw={700} size="xl" className="font-medieval text-center">
              {houseUpgrade.name}
            </Text>
            
            <Text size="sm" color="dimmed" className="text-center">
              Housing brings new citizens to your fortification every day.
            </Text>
            
            <Group position="apart" className="bg-gray-800/30 p-4 rounded">
              <Text size="sm">New Citizens Per Day:</Text>
              <Text fw={600}>{houseUpgrade.citizensDaily}</Text>
            </Group>
            
            <Text size="xs" color="dimmed" className="italic text-center">
              You will gain the above citizens every day at midnight OT time.
            </Text>
          </Stack>
        </ContentCard>

        {/* Next Upgrade */}
        <ContentCard
          title="Next Upgrade"
          icon={<BiUpArrowAlt size={18} />}
          variant={canUpgrade ? "highlight" : "default"}
          titlePosition="left"
        >
          <Stack gap="md" className="p-2">
            <Text fw={700} size="xl" className="font-medieval text-center">
              {nextUpgrade.name}
            </Text>
            
            <Text size="sm" color="dimmed" className="text-center">
              Upgrade your housing to bring more citizens to your fortification every day.
            </Text>
            
            <Group position="apart" className="bg-gray-800/30 p-4 rounded">
              <Text size="sm">New Citizens Per Day:</Text>
              <Text fw={600}>{nextUpgrade.citizensDaily}</Text>
            </Group>
            
            <Group position="apart" className="bg-gray-800/30 p-4 rounded">
              <Text size="sm">Fortification Required:</Text>
              <Text fw={600} color={user?.fortLevel < nextUpgrade.fortLevel ? "red" : "inherit"}>
                {Fortifications[nextUpgrade.fortLevel].name}
              </Text>
            </Group>
            
            <Group position="apart" className="bg-gray-800/30 p-4 rounded">
              <Text size="sm">Cost:</Text>
              <Text fw={600} color={user?.gold < BigInt(nextUpgrade.cost) ? "red" : "inherit"}>
                {toLocale(nextUpgrade.cost, user?.locale)} Gold
              </Text>
            </Group>
            
            <Button
              color="brand"
              fullWidth
              onClick={handleBuyUpgrade}
              loading={isUpgrading}
              disabled={!canUpgrade}
              className="mt-2"
            >
              {canUpgrade ? "Upgrade Now" : "Cannot Upgrade Yet"}
            </Button>
          </Stack>
        </ContentCard>
      </SimpleGrid>
    </MainArea>
  );
};

export default Housing;
