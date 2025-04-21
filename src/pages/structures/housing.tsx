import { Fortifications, HouseUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { Group, rem, Text, SimpleGrid, Space, Stack, Button, Tooltip } from '@mantine/core';
import { BiCoinStack, BiSolidBank, BiHome, BiUpArrowAlt } from 'react-icons/bi';
import { useEffect, useState } from 'react';
import toLocale from '@/utils/numberFormatting';
import MainArea from '@/components/MainArea';
import ContentCard from '@/components/ContentCard';
import StatCard from '@/components/StatCard';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { logError } from '@/utils/logger'; // Import logError

/**
 * Page component for viewing and upgrading housing structures.
 * Displays current housing level, benefits, next upgrade details, cost, and requirements.
 * Allows users to purchase the next housing upgrade.
 */
const Housing: React.FC = (props) => { // Removed unused props
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
    const currentLevel = user.houseLevel ?? 0; // Default to 0 if undefined
    setHouseUpgrade(HouseUpgrades[currentLevel]);
    setNextUpgrade(HouseUpgrades[currentLevel + 1]); // Will be undefined if max level
    setHouseLevel(currentLevel);
    setGold(user.gold ?? BigInt(0)); // Default to BigInt(0)
    setGoldInBank(user.goldInBank ?? BigInt(0)); // Default to BigInt(0)
    setCitizens(user.citizens ?? 0); // Default to 0
    setCitizensDaily(HouseUpgrades[currentLevel]?.citizensDaily ?? 0); // Default to 0
  }, [user]);

  /**
   * Handles the purchase of the next housing upgrade.
   * Calls the utility function `buyUpgrade` and forces a user context update.
   */
  const handleBuyUpgrade = async () => {
    if (isUpgrading || !nextUpgrade) return; // Prevent upgrade if already processing or no next upgrade
    setIsUpgrading(true);

    try {
      // Pass correct arguments: page, index (next level), forceUpdate
      await buyUpgrade('house', user.houseLevel + 1, forceUpdate);
      // forceUpdate is called within buyUpgrade on success, no need to call again here
    } catch (error: any) {
      logError('Failed to upgrade housing:', error);
      // alertService might be called within buyUpgrade, otherwise add here
      // alertService.error(error.message || 'Failed to upgrade housing.');
    } finally {
      setIsUpgrading(false);
    }
  };

  // Avoid rendering until component is mounted (prevents hydration errors)
  if (!mounted || !user) return <MainArea title='Housing'><Text>Loading...</Text></MainArea>;

  const nextUpgradeCost = BigInt(nextUpgrade?.cost ?? 0);
  const userGold = BigInt(user.gold ?? 0);
  const needsMoreGold = userGold < nextUpgradeCost;
  const needsHigherFort = user.fortLevel < (nextUpgrade?.fortLevel ?? Infinity);
  const canUpgrade = !needsMoreGold && !needsHigherFort && nextUpgrade; // Ensure nextUpgrade exists

  // Determine tooltip message
  let tooltipMessage = '';
  if (!canUpgrade && nextUpgrade) {
      const reasons = [];
      if (needsMoreGold) reasons.push(`Requires ${toLocale(nextUpgradeCost, user.locale)} Gold`);
      if (needsHigherFort) reasons.push(`Requires Fortification: ${Fortifications[nextUpgrade.fortLevel]?.name ?? 'Unknown'}`);
      tooltipMessage = reasons.join(' and ');
  } else if (!nextUpgrade) {
      tooltipMessage = 'Max level reached';
  }

  return (
    <MainArea title='Housing'>
      {/* Resource Stats */}
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} className="mb-6">
        <StatCard
          title="Gold In Hand"
          value={toLocale(user.gold ?? 0)}
          icon={<BiCoinStack size={18} />}
        />
        <StatCard
          title="Banked Gold"
          value={toLocale(user.goldInBank ?? 0)}
          icon={<BiSolidBank size={18} />}
        />
        <StatCard
          title="Citizens"
          value={toLocale(user?.citizens ?? 0)}
          subtext={`+${citizensDaily} daily`} // Changed subtitle to subtext
          icon={<BiHome size={18} />}
        />
      </SimpleGrid>

      <Space h="md" />

      {/* Current Housing */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl"> {/* Changed gap to spacing */}
        <ContentCard
          title="Current Housing"
          icon={<BiHome size={18} />}
          variant="default"
          titlePosition="left"
        >
          <Stack gap="md" className="p-2">
            <Text fw={700} size="xl" className="font-medieval text-center">
              {houseUpgrade?.name ?? 'N/A'}
            </Text>

            <Text size="sm" color="dimmed" className="text-center">
              Housing brings new citizens to your fortification every day.
            </Text>

            <Group justify="space-between" className="bg-gray-800/30 p-4 rounded">
              <Text size="sm">New Citizens Per Day:</Text>
              <Text fw={600}>{houseUpgrade?.citizensDaily ?? 0}</Text>
            </Group>

            <Text size="xs" color="dimmed" className="italic text-center">
              You will gain the above citizens every day at midnight OT time.
            </Text>
          </Stack>
        </ContentCard>

        {/* Next Upgrade - Conditionally render if nextUpgrade exists */}
        {nextUpgrade ? (
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

              <Group justify="space-between" className="bg-gray-800/30 p-4 rounded">
                <Text size="sm">New Citizens Per Day:</Text>
                <Text fw={600}>{nextUpgrade.citizensDaily}</Text>
              </Group>

              <Group justify="space-between" className="bg-gray-800/30 p-4 rounded">
                <Text size="sm">Fortification Required:</Text>
                <Text fw={600} color={needsHigherFort ? "red" : "inherit"}>
                  {Fortifications[nextUpgrade.fortLevel]?.name ?? 'N/A'}
                </Text>
              </Group>

              <Group justify="space-between" className="bg-gray-800/30 p-4 rounded">
                <Text size="sm">Cost:</Text>
                <Text fw={600} color={needsMoreGold ? "red" : "inherit"}>
                  {toLocale(nextUpgrade.cost, user.locale)} Gold
                </Text>
              </Group>

              {/* Wrap Button with Tooltip */}
              <Tooltip label={tooltipMessage} disabled={canUpgrade || isUpgrading} withArrow position="bottom">
                 {/* Added div wrapper for Tooltip compatibility when button is disabled */}
                <div style={{ width: '100%' }}>
                    <Button
                      color="brand"
                      fullWidth
                      onClick={handleBuyUpgrade}
                      loading={isUpgrading}
                      disabled={!canUpgrade || isUpgrading} // Also disable while upgrading
                      className="mt-2"
                    >
                      {canUpgrade ? "Upgrade Now" : "Cannot Upgrade Yet"}
                    </Button>
                </div>
              </Tooltip>
            </Stack>
          </ContentCard>
        ) : (
           <ContentCard title="Max Level Reached" icon={<BiHome size={18} />} variant="default" titlePosition="left">
                <Text ta="center" p="md">You have reached the maximum housing level.</Text>
           </ContentCard>
        )}
      </SimpleGrid>
    </MainArea>
  );
};

export default Housing;
