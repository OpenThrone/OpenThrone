import { faPeopleGroup, faShield } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Box,
  Button,
  Flex,
  Group,
  rem,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BiCoinStack, BiSolidBank } from 'react-icons/bi';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import NewUnitSection from '@/components/newUnitSection';
import { EconomyUpgrades, Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { PlayerUnit, UnitType, User } from '@/types/typings'; // Assuming User type is defined elsewhere or use specific type from context
import { logDebug, logError } from '@/utils/logger'; // Added logError
import toLocale from '@/utils/numberFormatting';

/**
 * Represents data structure for a unit displayed in training section.
 */
interface UnitData {
  id: string; // Unique identifier (e.g., "OFFENSE_1")
  name: string;
  bonus: number;
  ownedUnits: number;
  requirement: string; // Fortification name required
  cost: number; // Adjusted cost including price bonus
  enabled: boolean; // Whether user meets requirements
  level: number;
  usage: UnitType; // Should be UnitType, but usage might be legacy? Verify type.
  fortLevel: number; // Fort level required
}

/**
 * Defines structure for managing different unit type sections.
 */
interface UnitTypeIndex {
  type: UnitType;
  sectionTitle: string;
  unitData: UnitData[] | null;
  updateFn: React.Dispatch<React.SetStateAction<UnitData[] | null>>;
}

/**
 * Page component for training and untraining units.
 * Displays different unit sections (Economy, Offense, Defense, etc.)
 * and allows users to manage unit quantities. Includes a sticky footer
 * for order summary and actions.
 */
const Training: React.FC = (props) => {
  // Removed unused props
  const { t } = useTranslation('battle');
  const { user, forceUpdate } = useUser();
  const [totalCost, setTotalCost] = useState(0);
  const [unitCosts, setUnitCosts] = useState<{ [key: string]: number }>({}); // Maps unitId to quantity input
  const [isSummaryDocked, setIsSummaryDocked] = useState(false);
  const summarySentinelRef = useRef<HTMLDivElement | null>(null);

  // State for each unit section's data
  const [workerUnits, setWorkerUnits] = useState<UnitData[] | null>(null);
  const [offenseUnits, setOffenseUnits] = useState<UnitData[] | null>(null);
  const [defenseUnits, setDefenseUnits] = useState<UnitData[] | null>(null);
  const [spyUnits, setSpyUnits] = useState<UnitData[] | null>(null);
  const [sentryUnits, setSentryUnits] = useState<UnitData[] | null>(null);

  // Memoized index for managing unit sections and their state
  const unitTypesIndex: UnitTypeIndex[] = useMemo(
    () => [
      {
        type: 'WORKER' as UnitType,
        sectionTitle: t('training.economy'),
        unitData: workerUnits,
        updateFn: setWorkerUnits,
      },
      {
        type: 'OFFENSE' as UnitType,
        sectionTitle: t('training.offense'),
        unitData: offenseUnits,
        updateFn: setOffenseUnits,
      },
      {
        type: 'DEFENSE' as UnitType,
        sectionTitle: t('training.defense'),
        unitData: defenseUnits,
        updateFn: setDefenseUnits,
      },
      {
        type: 'SPY' as UnitType,
        sectionTitle: t('training.spy'),
        unitData: spyUnits,
        updateFn: setSpyUnits,
      },
      {
        type: 'SENTRY' as UnitType,
        sectionTitle: t('training.sentry'),
        unitData: sentryUnits,
        updateFn: setSentryUnits,
      },
    ],
    [workerUnits, offenseUnits, defenseUnits, spyUnits, sentryUnits, t],
  );

  /**
   * Creates an object with section types as keys and 0 as values, used for initializing section costs.
   */
  const getBlankSectionCosts = useCallback((): { [key: string]: number } => {
    return Object.fromEntries(
      unitTypesIndex.map((unitType) => [unitType.type, 0]),
    );
  }, [unitTypesIndex]);

  const [sectionCosts, setSectionCosts] = useState(() =>
    getBlankSectionCosts(),
  );

  /**
   * Callback function passed to NewUnitSection to update cost contribution of that section.
   * Recalculates total cost across all sections.
   * @param section - The UnitType of section updating its cost.
   * @param cost - The new total cost for that section.
   */
  const updateTotalCost = useCallback((section: UnitType, cost: number) => {
    logDebug(`updateTotalCost called with section: ${section}, cost: ${cost}`);
    const validatedCost = Number.isFinite(cost) ? cost : 0; // Ensure cost is a valid number
    setSectionCosts((prevCosts) => {
      const updatedCosts = { ...prevCosts, [section]: validatedCost };
      // Recalculate total cost from updated section costs
      const newTotalCost = Object.values(updatedCosts).reduce(
        (acc, curr) => acc + (Number.isFinite(curr) ? curr : 0), // Sum only valid numbers
        0,
      );
      setTotalCost(Number.isFinite(newTotalCost) ? newTotalCost : 0); // Ensure total cost is valid
      return updatedCosts;
    });
  }, []); // No dependencies needed as it only uses setters

  /**
   * Resets quantities entered in all unit sections and total cost.
   */
  const resetUnitCosts = useCallback(() => {
    setUnitCosts({}); // Clear individual unit quantities
    setTotalCost(0); // Reset total cost
    setSectionCosts(getBlankSectionCosts()); // Reset individual section costs
  }, [getBlankSectionCosts]);

  /**
   * Maps raw unit data (from constants or user) to UnitData structure needed by sections.
   * Calculates adjusted cost based on user's price bonus.
   * @param unit - The raw unit data.
   * @param idPrefix - The UnitType prefix for unit ID.
   * @returns A UnitData object or undefined if user is not available.
   */
  const unitMapFunction = useCallback(
    (unit: any, idPrefix: string): UnitData | undefined => {
      if (!user) return undefined;
      const bonus =
        unit.name === 'Worker'
          ? EconomyUpgrades?.[user.economyLevel]?.goldPerWorker // Specific bonus for workers
          : unit.bonus;
      const unitId = `${idPrefix}_${unit.level}`;
      const ownedUnit = user.units?.find(
        (u: PlayerUnit) => u.type === unit.type && u.level === unit.level,
      );
      const requirementFort = Fortifications.find(
        (fort) => fort.level === unit.fortLevel,
      );
      const baseCost = Number(String(unit.cost || '0').replace(/,/g, '')) || 0;
      const userPriceBonus = user?.priceBonus ?? 0; // e.g. 10 means 10%
      const discountAmount = Math.ceil((userPriceBonus / 100) * baseCost);
      const adjustedCost = Math.max(0, baseCost - discountAmount);
      return {
        id: unitId,
        name: unit.name,
        bonus: bonus ?? 0,
        ownedUnits: ownedUnit?.quantity || 0,
        requirement: requirementFort?.name || 'Unknown',
        cost: adjustedCost,
        enabled:
          user.fortLevel !== undefined && unit.fortLevel <= user.fortLevel,
        level: unit.level,
        usage: unit.type as UnitType, // Assuming unit.type is compatible
        fortLevel: unit.fortLevel,
      };
    },
    [user],
  ); // Depends on user object

  // Effect to populate unit section states when user data is available or changes
  useEffect(() => {
    if (!user?.availableUnitTypes) return; // Ensure user and available types exist

    let stateChanged = false;
    unitTypesIndex.forEach((unitTypeInfo) => {
      const newUnitData = user.availableUnitTypes
        .filter((unit: any) => unit.type === unitTypeInfo.type)
        .map((unit: any) => unitMapFunction(unit, unitTypeInfo.type))
        .filter((unit): unit is UnitData => unit !== undefined); // Ensure map function didn't return undefined

      // Only update state if data has actually changed to prevent infinite loops
      if (
        JSON.stringify(newUnitData) !== JSON.stringify(unitTypeInfo.unitData)
      ) {
        unitTypeInfo.updateFn(newUnitData);
        stateChanged = true;
      }
    });
    // Optionally log if state changed, useful for debugging
    // if (stateChanged) {
    //   console.log("Unit section data updated.");
    // }
  }, [user, unitMapFunction, unitTypesIndex]); // Rerun when user, map function, or index changes

  /**
   * Gathers quantities entered for each unit across all sections.
   * @returns An array of objects containing unit type, quantity, and level for units with quantity > 0.
   */
  const getUnitQuantities = useCallback(() => {
    return unitTypesIndex
      .reduce<UnitData[]>(
        (curVal, unitType) =>
          unitType.unitData ? [...curVal, ...unitType.unitData] : curVal, // Flatten unit data from all sections
        [],
      )
      .filter((unit): unit is UnitData => unit !== null) // Filter out null/disabled units
      .map((unit) => {
        // const unitComponents = unit.id.split('_'); // ID format like "OFFENSE_1"
        return {
          type: unit.usage, // Use 'usage' field which should be UnitType
          quantity: unitCosts[unit.id] || 0, // Get quantity from state
          level: unit.level, // Use level directly
        };
      })
      .filter((unit) => unit.quantity > 0); // Only include units with quantity > 0
  }, [unitTypesIndex, unitCosts]);

  /**
   * Calls backend API to train or untrain units.
   * @param endpoint - The API endpoint ('train' or 'untrain').
   * @param user - The current user object.
   * @param units - An array of units to modify with their quantities and levels.
   * @returns The API response data on success, or null on failure/no units.
   * @throws Error if API call fails or returns an error status.
   */
  const callTrainingApi = useCallback(
    async (
      endpoint: 'train' | 'untrain',
      user: User,
      units: { type: UnitType; quantity: number; level: number }[],
    ) => {
      if (units.length === 0) {
        alertService.warn(t('training.noUnitsSelected', { action: endpoint }));
        return null;
      }
      try {
        const response = await fetch(`/api/training/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, units }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data?.error ||
              `Calling training API endpoint ${endpoint} failed with status ${response.status}.`,
          );
        }
        alertService.success(
          data.message ||
            t('training.trainingSuccessful', {
              action: endpoint.charAt(0).toUpperCase() + endpoint.slice(1),
            }),
        );
        return data;
      } catch (error: any) {
        logError(`Error calling ${endpoint} API:`, error); // Use logError
        throw new Error(
          error.message || `An unexpected error occurred during ${endpoint}.`,
        );
      }
    },
    [],
  );

  /**
   * Updates local state of unit sections based on API response after training/untraining.
   * @param data - The data object returned from API, expected to contain a `data` array of updated units.
   */
  const updateLocalUnits = useCallback(
    (data: any) => {
      if (!data?.data || !Array.isArray(data.data)) {
        console.warn(
          'API response missing expected data structure for unit update.',
        );
        forceUpdate(); // Force update anyway, maybe backend succeeded
        return;
      }

      const updatedUnitMap = new Map<string, number>();
      // Assuming data.data is an array of { type: UnitType; level: number; quantity: number }
      data.data.forEach(
        (u: { type: UnitType; level: number; quantity: number }) => {
          updatedUnitMap.set(`${u.type}_${u.level}`, u.quantity);
        },
      );

      // Update state for each section
      unitTypesIndex.forEach((unitTypeInfo) => {
        unitTypeInfo.updateFn((prevUnits) => {
          if (!prevUnits) return null;
          return prevUnits.map((unit) => {
            const updatedQuantity = updatedUnitMap.get(unit.id);
            // If an updated quantity exists for this unit ID, update ownedUnits
            return updatedQuantity !== undefined
              ? { ...unit, ownedUnits: updatedQuantity }
              : unit;
          });
        });
      });

      resetUnitCosts(); // Reset input fields and costs
      forceUpdate(); // Force user context update
    },
    [unitTypesIndex, resetUnitCosts, forceUpdate],
  );

  /**
   * Handles form submission for either training or untraining all selected units.
   * Validates input, checks gold/citizens, calls API, and updates local state.
   * @param submitType - Whether to 'train' or 'untrain'.
   */
  const handleFormSubmit = useCallback(
    async (submitType: 'train' | 'untrain') => {
      if (!user) {
        alertService.error(t('training.userNotFound'));
        return;
      }
      const unitsToModify = getUnitQuantities();

      if (unitsToModify.length === 0) {
        alertService.warn(
          `Please enter quantity of units you wish to ${submitType}.`,
        );
        return;
      }

      // Validation for training
      if (submitType === 'train') {
        const requiredGold = BigInt(totalCost); // totalCost should be up-to-date number
        const userGold = BigInt(user.gold ?? 0);
        if (requiredGold > userGold) {
          alertService.error(
            t('training.insufficientGold', {
              needed: toLocale(requiredGold, user.locale),
              have: toLocale(userGold, user.locale),
            }),
          );
          return;
        }
        const citizensRequired = unitsToModify.reduce(
          (sum, unit) => sum + unit.quantity,
          0,
        );
        const availableCitizens =
          user.units?.find((u) => u.type === 'CITIZEN')?.quantity ?? 0;
        if (citizensRequired > availableCitizens) {
          alertService.error(
            t('training.insufficientCitizens', {
              needed: toLocale(citizensRequired, user.locale),
              have: toLocale(availableCitizens, user.locale),
            }),
          );
          return;
        }
      }
      // Validation for untraining (already partially handled in getUnitQuantities, but double-check here if needed)
      // Could add a check here to ensure untrain quantity doesn't exceed owned for each unit type again if necessary

      try {
        const data = await callTrainingApi(submitType, user, unitsToModify);
        if (data) {
          updateLocalUnits(data); // Update UI on success
        }
      } catch (error: any) {
        alertService.error(
          error.message || t('training.failedToTrain', { action: submitType }),
        );
      }
    },
    [user, getUnitQuantities, totalCost, updateLocalUnits, callTrainingApi, t],
  ); // Added callTrainingApi dependency

  const handleTrainAll = () => handleFormSubmit('train');
  const handleUntrainAll = () => handleFormSubmit('untrain');

  const hasOrder = totalCost > 0;

  useEffect(() => {
    if (!hasOrder) {
      setIsSummaryDocked(false);
      return;
    }

    const sentinel = summarySentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSummaryDocked(!entry.isIntersecting);
      },
      { root: null, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasOrder]);

  if (!user) {
    return (
      <MainArea title={t('training.title')}>
        <Text>{t('training.loadingUserData')}</Text>
      </MainArea>
    );
  }

  const citizenCount =
    user.units?.find((unit) => unit.type === 'CITIZEN')?.quantity ?? 0;
  const defenseTotal = user.unitTotals?.defense ?? 0;
  const population = user.population ?? 0; // Use pre-calculated population if available
  const defenseRatio = population > 0 ? defenseTotal / population : 0;

  return (
    <MainArea title={t('training.title')}>
      <GameCard title={t('training.trainingStatus')} icon={faPeopleGroup}>
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="sm">
          {[
            {
              label: t('training.untrainedCitizens'),
              value: toLocale(citizenCount),
              icon: (
                <FontAwesomeIcon
                  icon={faPeopleGroup}
                  style={{ width: rem(15), height: rem(15) }}
                />
              ),
            },
            {
              label: t('training.goldOnHand'),
              value: toLocale(user.gold) ?? 0,
              icon: <BiCoinStack style={{ width: rem(15), height: rem(15) }} />,
            },
            {
              label: t('training.bankedGold'),
              value: toLocale(user.goldInBank) ?? 0,
              icon: <BiSolidBank style={{ width: rem(15), height: rem(15) }} />,
            },
            {
              label: t('training.defenseRatio'),
              value: `${toLocale(defenseRatio * 100, user.locale)} %`,
              icon: (
                <FontAwesomeIcon
                  icon={faShield}
                  style={{ width: rem(15), height: rem(15) }}
                />
              ),
            },
          ].map((stat) => (
            <Group
              key={stat.label}
              gap="sm"
              wrap="nowrap"
              style={{
                backgroundColor: '#0f141a',
                borderRadius: '6px',
                border: '1px solid #1f2b3b',
                boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                padding: '12px',
                alignItems: 'center',
              }}
            >
              <ThemeIcon c="white" variant="light">
                {stat.icon}
              </ThemeIcon>
              <div>
                <Text
                  size="xs"
                  fw={700}
                  c="dimmed"
                  tt="uppercase"
                  style={{ letterSpacing: '0.4em' }}
                >
                  {stat.label}
                </Text>
                <Text size="sm" fw={700} c="gray.2">
                  {stat.value}
                </Text>
              </div>
            </Group>
          ))}
        </SimpleGrid>
      </GameCard>
      {/* Add padding to bottom of main content area to prevent overlap with fixed footer */}
      <Box
        style={{ paddingBottom: hasOrder ? '160px' : 0 }}
        data-testid="unit-training-panel"
      >
        {unitTypesIndex
          .filter((unitType) => unitType.unitData !== null)
          .map((unitType) => (
            <NewUnitSection
              heading={unitType.sectionTitle}
              units={(unitType.unitData ?? [])
                .filter((u): u is UnitData => u !== undefined)
                .map((u) => ({ ...u, type: u.usage, cost: u.cost.toString() }))}
              updateTotalCost={updateTotalCost}
              unitCosts={unitCosts}
              setUnitCosts={setUnitCosts}
              unitType={unitType.type}
              key={unitType.type}
            />
          ))}
      </Box>
      <div ref={summarySentinelRef} />
      {hasOrder && (
        <Box
          className={`training-order-summary${isSummaryDocked ? '' : ' training-order-summary--inline'}`}
        >
          <Box style={{ padding: '0 16px' }}>
            <GameCard title={t('training.orderSummary')} goldAccent>
              <Flex
                justify="space-between"
                align="center"
                wrap="wrap"
                gap="md"
                p="xs"
              >
                <Group gap="xl" wrap="wrap">
                  <Stack gap={2}>
                    <Text
                      size="xs"
                      c="dimmed"
                      tt="uppercase"
                      fw={700}
                      style={{ letterSpacing: '0.3em' }}
                    >
                      {t('training.totalCost')}
                    </Text>
                    <Text size="lg" fw={800} c="gray.1">
                      {toLocale(totalCost, user.locale)}
                    </Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text
                      size="xs"
                      c="dimmed"
                      tt="uppercase"
                      fw={700}
                      style={{ letterSpacing: '0.3em' }}
                    >
                      {t('training.refund')}
                    </Text>
                    <Text size="sm" fw={700} c="dimmed">
                      {toLocale(Math.floor(totalCost * 0.75), user.locale)}
                    </Text>
                  </Stack>
                </Group>
                <Group gap="sm">
                  <Button
                    color="yellow"
                    onClick={handleTrainAll}
                    disabled={
                      totalCost <= 0 ||
                      BigInt(Math.ceil(totalCost)) > (user.gold ?? 0)
                    }
                    style={{
                      background:
                        'linear-gradient(180deg, #e5c55a 0%, #b98f2f 100%)',
                      color: '#000',
                      border: '1px solid #e5c55a',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                    }}
                    data-testid="train-button"
                    aria-label={t('training.train')}
                    role="button"
                  >
                    {t('training.train')}
                  </Button>
                  <Button
                    color="gray"
                    onClick={handleUntrainAll}
                    disabled={totalCost <= 0}
                    style={{
                      backgroundColor: '#1f2b3b',
                      borderColor: '#2f3e52',
                      color: '#e5e7eb',
                      boxShadow: '0 2px 0 #0f151c',
                    }}
                  >
                    {t('training.untrain')}
                  </Button>
                </Group>
              </Flex>
            </GameCard>
          </Box>
        </Box>
      )}
    </MainArea>
  );
};

export default Training;
