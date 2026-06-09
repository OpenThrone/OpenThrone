import {
  faArrowUp,
  faBuildingColumns,
  faCoins,
  faHome,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Box,
  Button,
  Group,
  SimpleGrid,
  Space,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { type ReactNode, useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import { StatGrid } from '@/components/game/StatGrid';
import MainArea from '@/components/MainArea';
import { Fortifications, HouseUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { logError } from '@/utils/logger'; // Import logError
import { toLocale } from '@/utils/numberFormatting';

/**
 * Page component for viewing and upgrading housing structures.
 * Displays current housing level, benefits, next upgrade details, cost, and requirements.
 * Allows users to purchase the next housing upgrade.
 */
const Housing: React.FC = () => {
  // Removed unused props
  const { user, forceUpdate } = useUser();
  const [mounted, setMounted] = useState(false);
  const [houseLevel, setHouseLevel] = useState(1);
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
  if (!mounted || !user)
    return (
      <MainArea title="Housing">
        <Text>Loading...</Text>
      </MainArea>
    );

  const nextUpgradeCost = BigInt(nextUpgrade?.cost ?? 0);
  const userGold = BigInt(user.gold ?? 0);
  const needsMoreGold = userGold < nextUpgradeCost;
  const needsHigherFort = user.fortLevel < (nextUpgrade?.fortLevel ?? Infinity);
  const canUpgrade = !needsMoreGold && !needsHigherFort && nextUpgrade; // Ensure nextUpgrade exists

  // Determine tooltip message
  let tooltipMessage = '';
  if (!canUpgrade && nextUpgrade) {
    const reasons = [];
    if (needsMoreGold)
      reasons.push(`Requires ${toLocale(nextUpgradeCost, user.locale)} Gold`);
    if (needsHigherFort)
      reasons.push(
        `Requires Fortification: ${Fortifications[nextUpgrade.fortLevel]?.name ?? 'Unknown'}`,
      );
    tooltipMessage = reasons.join(' and ');
  } else if (!nextUpgrade) {
    tooltipMessage = 'Max level reached';
  }

  const statItems = [
    {
      label: 'Gold In Hand',
      value: toLocale(user.gold ?? 0, user.locale),
      icon: <FontAwesomeIcon icon={faCoins} />,
    },
    {
      label: 'Banked Gold',
      value: toLocale(user.goldInBank ?? 0, user.locale),
      icon: <FontAwesomeIcon icon={faBuildingColumns} />,
    },
    {
      label: 'Citizens',
      value: `${toLocale(user?.citizens ?? 0, user.locale)} (+${citizensDaily}/day)`,
      icon: <FontAwesomeIcon icon={faHome} />,
    },
  ];

  const renderSlotRow = (
    label: string,
    value: ReactNode,
    highlight?: boolean,
  ) => (
    <Group
      justify="space-between"
      style={{
        backgroundColor: '#0f141a',
        borderRadius: '6px',
        border: '1px solid #1f2b3b',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
        padding: '12px',
      }}
    >
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={600} c={highlight ? 'red' : 'inherit'}>
        {value}
      </Text>
    </Group>
  );

  return (
    <MainArea title="Housing">
      <StatGrid title="Housing Overview" stats={statItems} columns={3} />
      <Space h="md" />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <GameCard
          title="Current Housing"
          icon={<FontAwesomeIcon icon={faHome} />}
        >
          <Stack gap="md">
            <Text fw={700} size="xl" className="text-center font-medieval">
              {houseUpgrade?.name ?? 'N/A'}
            </Text>

            <Text size="sm" c="dimmed" ta="center">
              Housing brings new citizens to your fortification every day.
            </Text>

            {renderSlotRow(
              'New Citizens Per Day',
              houseUpgrade?.citizensDaily ?? 0,
            )}

            <Text size="xs" c="dimmed" className="text-center italic">
              You will gain the above citizens every day at midnight OT time.
            </Text>
          </Stack>
        </GameCard>

        {nextUpgrade ? (
          <GameCard
            title="Next Upgrade"
            icon={<FontAwesomeIcon icon={faArrowUp} />}
            goldAccent={canUpgrade}
          >
            <Stack gap="md">
              <Text fw={700} size="xl" className="text-center font-medieval">
                {nextUpgrade.name}
              </Text>

              <Text size="sm" c="dimmed" ta="center">
                Upgrade your housing to bring more citizens to your
                fortification every day.
              </Text>

              {renderSlotRow('New Citizens Per Day', nextUpgrade.citizensDaily)}
              {renderSlotRow(
                'Fortification Required',
                Fortifications[nextUpgrade.fortLevel]?.name ?? 'N/A',
                needsHigherFort,
              )}
              {renderSlotRow(
                'Cost',
                `${toLocale(nextUpgrade.cost, user.locale)} Gold`,
                needsMoreGold,
              )}

              <Tooltip
                label={tooltipMessage}
                disabled={canUpgrade || isUpgrading}
                withArrow
                position="bottom"
              >
                <Box>
                  <Button
                    color="yellow"
                    fullWidth
                    onClick={handleBuyUpgrade}
                    loading={isUpgrading}
                    disabled={!canUpgrade || isUpgrading}
                  >
                    {canUpgrade ? 'Upgrade Now' : 'Cannot Upgrade Yet'}
                  </Button>
                </Box>
              </Tooltip>
            </Stack>
          </GameCard>
        ) : (
          <GameCard
            title="Max Level Reached"
            icon={<FontAwesomeIcon icon={faHome} />}
          >
            <Text ta="center" p="md">
              You have reached the maximum housing level.
            </Text>
          </GameCard>
        )}
      </SimpleGrid>
    </MainArea>
  );
};

export default Housing;
