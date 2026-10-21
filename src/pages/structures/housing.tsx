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
import { useTranslation } from 'next-i18next';
import { type ReactNode, useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import { PageLoading } from '@/components/game/PageLoading';
import panelClasses from '@/components/game/Panels.module.css';
import { StatGrid } from '@/components/game/StatGrid';
import MainArea from '@/components/MainArea';
import { HouseUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import type { Locales } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { logError } from '@/utils/logger'; // Import logError
import { toLocale } from '@/utils/numberFormatting';
import { fortificationName, structureName } from '@/utils/structureNames';

/**
 * Page component for viewing and upgrading housing structures.
 * Displays current housing level, benefits, next upgrade details, cost, and requirements.
 * Allows users to purchase the next housing upgrade.
 */
const Housing: React.FC = () => {
  // Removed unused props
  const { t, i18n } = useTranslation('structures');
  const locale = i18n.language as Locales;
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
      await buyUpgrade('houses', user.houseLevel + 1, forceUpdate);
      // forceUpdate is called within buyUpgrade on success, no need to call again here
    } catch (error: unknown) {
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
      <MainArea title={t('housing.title')}>
        <PageLoading label={t('housing.loading')} stats={4} />
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
      reasons.push(
        t('housing.requiresGold', {
          gold: toLocale(nextUpgradeCost, locale),
        }),
      );
    if (needsHigherFort)
      reasons.push(
        t('housing.requiresFortification', {
          name:
            fortificationName(t, nextUpgrade.fortLevel) ?? t('housing.unknown'),
        }),
      );
    tooltipMessage = reasons.join(` ${t('housing.and')} `);
  } else if (!nextUpgrade) {
    tooltipMessage = t('housing.maxLevelReached');
  }

  const statItems = [
    {
      label: t('bank.goldInHand'),
      value: toLocale(user.gold ?? 0, locale),
      icon: <FontAwesomeIcon icon={faCoins} />,
    },
    {
      label: t('bank.goldInBank'),
      value: toLocale(user.goldInBank ?? 0, locale),
      icon: <FontAwesomeIcon icon={faBuildingColumns} />,
    },
    {
      label: t('housing.citizens'),
      value: t('housing.citizensWithDaily', {
        citizens: toLocale(user?.citizens ?? 0, locale),
        daily: toLocale(citizensDaily, locale),
      }),
      icon: <FontAwesomeIcon icon={faHome} />,
    },
  ];

  const renderSlotRow = (
    label: string,
    value: ReactNode,
    highlight?: boolean,
  ) => (
    <Group justify="space-between" className={panelClasses.insetRow}>
      <Text size="sm" c="var(--ot-muted)">
        {label}
      </Text>
      <Text fw={600} c={highlight ? 'red' : 'inherit'}>
        {value}
      </Text>
    </Group>
  );

  return (
    <MainArea title={t('housing.title')}>
      <StatGrid title={t('housing.overview')} stats={statItems} columns={3} />
      <Space h="md" />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <GameCard
          title={t('housing.currentHousing')}
          icon={<FontAwesomeIcon icon={faHome} />}
        >
          <Stack gap="md">
            <Text fw={700} size="xl" className="text-center font-medieval">
              {structureName(
                t,
                'housing',
                houseUpgrade?.index,
                houseUpgrade?.name,
              ) ?? t('housing.notAvailable')}
            </Text>

            <Text size="sm" c="var(--ot-muted)" ta="center">
              {t('housing.citizensNote')}
            </Text>

            {renderSlotRow(
              t('housing.newCitizensPerDay'),
              toLocale(houseUpgrade?.citizensDaily ?? 0, locale),
            )}

            <Text size="xs" c="var(--ot-muted)" className="text-center italic">
              {t('housing.midnightNote')}
            </Text>
          </Stack>
        </GameCard>

        {nextUpgrade ? (
          <GameCard
            title={t('housing.nextUpgrade')}
            icon={<FontAwesomeIcon icon={faArrowUp} />}
            goldAccent={canUpgrade}
          >
            <Stack gap="md">
              <Text fw={700} size="xl" className="text-center font-medieval">
                {structureName(
                  t,
                  'housing',
                  nextUpgrade.index,
                  nextUpgrade.name,
                )}
              </Text>

              <Text size="sm" c="var(--ot-muted)" ta="center">
                {t('housing.upgradeNote')}
              </Text>

              {renderSlotRow(
                t('housing.newCitizensPerDay'),
                toLocale(nextUpgrade.citizensDaily, locale),
              )}
              {renderSlotRow(
                t('housing.fortificationRequired'),
                fortificationName(t, nextUpgrade.fortLevel) ??
                  t('housing.notAvailable'),
                needsHigherFort,
              )}
              {renderSlotRow(
                t('housing.cost'),
                t('housing.costGold', {
                  amount: toLocale(nextUpgrade.cost, locale),
                }),
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
                    fullWidth
                    onClick={handleBuyUpgrade}
                    loading={isUpgrading}
                    disabled={!canUpgrade || isUpgrading}
                  >
                    {canUpgrade
                      ? t('housing.upgradeNow')
                      : t('housing.cannotUpgradeYet')}
                  </Button>
                </Box>
              </Tooltip>
            </Stack>
          </GameCard>
        ) : (
          <GameCard
            title={t('housing.maxLevelReached')}
            icon={<FontAwesomeIcon icon={faHome} />}
          >
            <Text ta="center" p="md">
              {t('housing.maxLevelNote')}
            </Text>
          </GameCard>
        )}
      </SimpleGrid>
    </MainArea>
  );
};

export default Housing;
