import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import NewUnitSection from '@/components/newUnitSection';
import { EconomyUpgrades, Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services';
import toLocale  from '@/utils/numberFormatting';
import { Group, SimpleGrid, Text, Button, Flex, Stack, Box, rem } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPeopleGroup, faShield } from '@fortawesome/free-solid-svg-icons';
import MainArea from '@/components/MainArea';
import { PlayerUnit, UnitType, User } from '@/types/typings'; // Assuming User type is defined elsewhere or use specific type from context
import StatCard from '@/components/StatCard';
import ContentCard from '@/components/ContentCard';
import { BiCoinStack, BiSolidBank } from 'react-icons/bi';
import { logDebug, logError } from '@/utils/logger'; // Added logError

/**
 * Represents the data structure for a unit displayed in the training section.
 */
interface UnitData {
  id: string; // Unique identifier (e.g., "OFFENSE_1")
  name: string;
  bonus: number;
  ownedUnits: number;
  requirement: string; // Fortification name required
  cost: number; // Adjusted cost including price bonus
  enabled: boolean; // Whether the user meets the requirements
  level: number;
  usage: UnitType; // Should be UnitType, but usage might be legacy? Verify type.
  fortLevel: number; // Fort level required
}

/**
 * Defines the structure for managing different unit type sections.
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
const Training: React.FC = (props) => { // Removed unused props
  const { user, forceUpdate } = useUser();
  const [totalCost, setTotalCost] = useState(0);
  const [unitCosts, setUnitCosts] = useState<{ [key: string]: number }>({}); // Maps unitId to quantity input

  // State for each unit section's data
  const [workerUnits, setWorkerUnits] = useState<UnitData[] | null>(null);
  const [offenseUnits, setOffenseUnits] = useState<UnitData[] | null>(null);
  const [defenseUnits, setDefenseUnits] = useState<UnitData[] | null>(null);
  const [spyUnits, setSpyUnits] = useState<UnitData[] | null>(null);
  const [sentryUnits, setSentryUnits] = useState<UnitData[] | null>(null);

  // Memoized index for managing unit sections and their state
  const unitTypesIndex: UnitTypeIndex[] = useMemo(() => [
    { type: 'WORKER' as UnitType, sectionTitle: 'Economy', unitData: workerUnits, updateFn: setWorkerUnits },
    { type: 'OFFENSE' as UnitType, sectionTitle: 'Offense', unitData: offenseUnits, updateFn: setOffenseUnits },
    { type: 'DEFENSE' as UnitType, sectionTitle: 'Defense', unitData: defenseUnits, updateFn: setDefenseUnits },
    { type: 'SPY' as UnitType, sectionTitle: 'Spy', unitData: spyUnits, updateFn: setSpyUnits },
    { type: 'SENTRY' as UnitType, sectionTitle: 'Sentry', unitData: sentryUnits, updateFn: setSentryUnits },
  ], [workerUnits, offenseUnits, defenseUnits, spyUnits, sentryUnits]);

  /**
   * Creates an object with section types as keys and 0 as values, used for initializing section costs.
   */
  const getBlankSectionCosts = useCallback((): { [key: string]: number } => {
    return Object.fromEntries(
      unitTypesIndex.map((unitType) => [unitType.type, 0])
    );
  }, [unitTypesIndex]);

  const [sectionCosts, setSectionCosts] = useState(() => getBlankSectionCosts());

  /**
   * Callback function passed to NewUnitSection to update the cost contribution of that section.
   * Recalculates the total cost across all sections.
   * @param section - The UnitType of the section updating its cost.
   * @param cost - The new total cost for that section.
   */
  const updateTotalCost = useCallback((section: UnitType, cost: number) => {
    logDebug(`updateTotalCost called with section: ${section}, cost: ${cost}`);
    const validatedCost = Number.isFinite(cost) ? cost : 0; // Ensure cost is a valid number
    setSectionCosts((prevCosts) => {
      const updatedCosts = { ...prevCosts, [section]: validatedCost };
      // Recalculate total cost from the updated section costs
      const newTotalCost = Object.values(updatedCosts).reduce(
        (acc, curr) => acc + (Number.isFinite(curr) ? curr : 0), // Sum only valid numbers
        0
      );
      setTotalCost(Number.isFinite(newTotalCost) ? newTotalCost : 0); // Ensure total cost is valid
      return updatedCosts;
    });
  }, []); // No dependencies needed as it only uses setters

  /**
   * Resets the quantities entered in all unit sections and the total cost.
   */
  const resetUnitCosts = useCallback(() => {
    setUnitCosts({}); // Clear individual unit quantities
    setTotalCost(0); // Reset total cost
    setSectionCosts(getBlankSectionCosts()); // Reset individual section costs
  }, [getBlankSectionCosts]);

  /**
   * Maps raw unit data (from constants or user) to the UnitData structure needed by sections.
   * Calculates adjusted cost based on user's price bonus.
   * @param unit - The raw unit data.
   * @param idPrefix - The UnitType prefix for the unit ID.
   * @returns A UnitData object or undefined if user is not available.
   */
  const unitMapFunction = useCallback((unit: any, idPrefix: string): UnitData | undefined => {
    if (!user) return undefined;
    const bonus =
      unit.name === 'Worker'
        ? EconomyUpgrades?.[user.economyLevel]?.goldPerWorker // Specific bonus for workers
        : unit.bonus;
    const unitId = `${idPrefix}_${unit.level}`;
    const ownedUnit = user.units?.find((u: PlayerUnit) => u.type === unit.type && u.level === unit.level);
    const requirementFort = Fortifications.find((fort) => fort.level === unit.fortLevel);
    const baseCost = Number(String(unit.cost || '0').replace(/,/g, '')) || 0;
    const priceBonusPercent = Number(user.priceBonus || 0) / 100;
    return {
      id: unitId,
      name: unit.name,
      bonus: bonus ?? 0,
      ownedUnits: ownedUnit?.quantity || 0,
      requirement: requirementFort?.name || 'Unknown',
      cost: Math.max(0, baseCost - (priceBonusPercent * baseCost)), // Apply price bonus, ensure non-negative
      enabled: user.fortLevel !== undefined && unit.fortLevel <= user.fortLevel,
      level: unit.level,
      usage: unit.type as UnitType, // Assuming unit.type is compatible
      fortLevel: unit.fortLevel,
    };
  }, [user]); // Depends on user object

  // Effect to populate unit section states when user data is available or changes
  useEffect(() => {
    if (!user?.availableUnitTypes) return; // Ensure user and available types exist

    let stateChanged = false;
    unitTypesIndex.forEach((unitTypeInfo) => {
      const newUnitData = user.availableUnitTypes
        .filter((unit: any) => unit.type === unitTypeInfo.type)
        .map((unit: any) => unitMapFunction(unit, unitTypeInfo.type))
        .filter((unit): unit is UnitData => unit !== undefined); // Ensure map function didn't return undefined

      // Only update state if the data has actually changed to prevent infinite loops
      if (JSON.stringify(newUnitData) !== JSON.stringify(unitTypeInfo.unitData)) {
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
   * Gathers the quantities entered for each unit across all sections.
   * @returns An array of objects containing unit type, quantity, and level for units with quantity > 0.
   */
  const getUnitQuantities = useCallback(() => {
    return unitTypesIndex.reduce<UnitData[]>((curVal, unitType) =>
      unitType.unitData ? [...curVal, ...unitType.unitData] : curVal, // Flatten unit data from all sections
      [])
      .filter((unit): unit is UnitData => unit !== null && unit.enabled) // Filter out null/disabled units
      .map((unit) => {
        // const unitComponents = unit.id.split('_'); // ID format like "OFFENSE_1"
        return {
          type: unit.usage, // Use the 'usage' field which should be UnitType
          quantity: unitCosts[unit.id] || 0, // Get quantity from state
          level: unit.level, // Use the level directly
        };
      })
      .filter(unit => unit.quantity > 0); // Only include units with quantity > 0
  }, [unitTypesIndex, unitCosts]);

  /**
   * Calls the backend API to train or untrain units.
   * @param endpoint - The API endpoint ('train' or 'untrain').
   * @param user - The current user object.
   * @param units - An array of units to modify with their quantities and levels.
   * @returns The API response data on success, or null on failure/no units.
   * @throws Error if the API call fails or returns an error status.
   */
  const callTrainingApi = useCallback(async (endpoint: 'train' | 'untrain', user: User, units: { type: UnitType; quantity: number; level: number }[]) => {
    if (units.length === 0) {
      alertService.warn(`No units selected to ${endpoint}.`);
      return null;
    }
    try {
      const response = await fetch(`/api/training/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, units: units }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `Calling training API endpoint ${endpoint} failed with status ${response.status}.`);
      }
      alertService.success(data.message || `${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)} successful!`);
      return data;
    } catch (error: any) {
      logError(`Error calling ${endpoint} API:`, error); // Use logError
      throw new Error(error.message || `An unexpected error occurred during ${endpoint}.`);
    }
  }, []);

  /**
   * Updates the local state of unit sections based on the API response after training/untraining.
   * @param data - The data object returned from the API, expected to contain a `data` array of updated units.
   */
  const updateLocalUnits = useCallback((data: any) => {
    if (!data?.data || !Array.isArray(data.data)) {
        console.warn("API response missing expected data structure for unit update.");
        forceUpdate(); // Force update anyway, maybe backend succeeded
        return;
    };

    const updatedUnitMap = new Map<string, number>();
    // Assuming data.data is an array of { type: UnitType; level: number; quantity: number }
    data.data.forEach((u: { type: UnitType; level: number; quantity: number }) => {
      updatedUnitMap.set(`${u.type}_${u.level}`, u.quantity);
    });

    // Update the state for each section
    unitTypesIndex.forEach((unitTypeInfo) => {
      unitTypeInfo.updateFn((prevUnits) => {
        if (!prevUnits) return null;
        return prevUnits.map((unit) => {
          const updatedQuantity = updatedUnitMap.get(unit.id);
          // If an updated quantity exists for this unit ID, update ownedUnits
          return updatedQuantity !== undefined ? { ...unit, ownedUnits: updatedQuantity } : unit;
        });
      });
    });

    resetUnitCosts(); // Reset input fields and costs
    forceUpdate(); // Force user context update
  }, [unitTypesIndex, resetUnitCosts, forceUpdate]);

  /**
   * Handles the form submission for either training or untraining all selected units.
   * Validates input, checks gold/citizens, calls the API, and updates local state.
   * @param submitType - Whether to 'train' or 'untrain'.
   */
  const handleFormSubmit = useCallback(async (submitType: 'train' | 'untrain') => {
    if (!user) {
      alertService.error('User not found. Please try again.');
      return;
    }
    const unitsToModify = getUnitQuantities();

    if (unitsToModify.length === 0) {
      alertService.warn(`Please enter the quantity of units you wish to ${submitType}.`);
      return;
    }

    // Validation for training
    if (submitType === 'train') {
        const requiredGold = BigInt(totalCost); // totalCost should be up-to-date number
        const userGold = BigInt(user.gold ?? 0);
        if (requiredGold > userGold) {
            alertService.error(`Insufficient gold. You need ${toLocale(requiredGold, user.locale)} but only have ${toLocale(userGold, user.locale)}.`);
            return;
        }
        const citizensRequired = unitsToModify.reduce((sum, unit) => sum + unit.quantity, 0);
        const availableCitizens = user.units?.find(u => u.type === 'CITIZEN')?.quantity ?? 0;
        if (citizensRequired > availableCitizens) {
             alertService.error(`Insufficient citizens. Need ${toLocale(citizensRequired, user.locale)}, have ${toLocale(availableCitizens, user.locale)}.`);
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
      alertService.error(error.message || `Failed to ${submitType} units. Please try again.`);
    }
  }, [user, getUnitQuantities, totalCost, updateLocalUnits, callTrainingApi]); // Added callTrainingApi dependency

  const handleTrainAll = () => handleFormSubmit('train');
  const handleUntrainAll = () => handleFormSubmit('untrain');

  // Refs for sticky footer calculation
  const parentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  // Effect for sticky footer logic
  useEffect(() => {
    const footerElement = footerRef.current;
    const scrollContainer = parentRef.current; // Use the MainArea ref
    if (!footerElement || !scrollContainer) return;

    let lastKnownScrollPosition = 0;
    let ticking = false;
    let lastWidth = ''; // Cache last width to avoid unnecessary style updates

    const handleScroll = () => {
      lastKnownScrollPosition = window.scrollY;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!footerElement || !scrollContainer) return; // Re-check elements inside animation frame

          const scrollHeight = document.documentElement.scrollHeight;
          const clientHeight = window.innerHeight;
          const scrollableHeight = scrollHeight - clientHeight;
          const footerHeight = footerElement.offsetHeight;

          // Check if the bottom of the scroll container is visible or nearly visible
          const parentRect = scrollContainer.getBoundingClientRect();
          const isNearBottom = lastKnownScrollPosition >= scrollableHeight - (footerHeight + 10); // Adjust threshold as needed

          if (isNearBottom) {
            // If near bottom, make footer relative
            if (footerElement.style.position !== 'relative') {
              footerElement.style.position = 'relative';
              footerElement.style.bottom = 'auto';
              footerElement.style.left = 'auto';
              footerElement.style.width = 'auto'; // Reset width
            }
          } else {
            // If not near bottom, make footer fixed
            if (footerElement.style.position !== 'fixed') {
              footerElement.style.position = 'fixed';
              footerElement.style.bottom = '0';
              lastWidth = ''; // Reset cached width when switching to fixed
            }
            // Update width and left only if necessary
            const newWidth = `${parentRect.width}px`;
            if (lastWidth !== newWidth) {
              footerElement.style.left = `${parentRect.left}px`;
              footerElement.style.width = newWidth;
              lastWidth = newWidth; // Cache the new width
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    // Initial call and event listeners
    handleScroll(); // Call once initially to set position
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Observe parent container resize to recalculate width/position
    const resizeObserver = new ResizeObserver(() => {
      lastWidth = ''; // Reset width cache on resize
      handleScroll(); // Recalculate on resize
    });
    if (scrollContainer) {
      resizeObserver.observe(scrollContainer);
    }

    // Cleanup listeners
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollContainer) {
        resizeObserver.unobserve(scrollContainer);
      }
    };
  }, []); // Empty dependency array means this runs once on mount and cleans up on unmount

  if (!user) {
    return <MainArea title="Training"><Text>Loading user data...</Text></MainArea>;
  }

  const citizenCount = user.units?.find(unit => unit.type === 'CITIZEN')?.quantity ?? 0;
  const defenseTotal = user.unitTotals?.defense ?? 0;
  const population = (user.population ?? 0); // Use pre-calculated population if available
  const defenseRatio = population > 0 ? defenseTotal / population : 0;

  return (
    <MainArea title="Training" ref={parentRef}>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} mb="lg">
        <StatCard
          title="Untrained Citizens"
          value={toLocale(citizenCount)}
          icon={<FontAwesomeIcon icon={faPeopleGroup} style={{ width: rem(15), height: rem(15) }} />}
        />
        <StatCard
          title="Gold On Hand"
          value={toLocale(user.gold) ?? 0}
          icon={<BiCoinStack style={{ width: rem(15), height: rem(15) }} />}
        />
        <StatCard
          title="Banked Gold"
          value={toLocale(user.goldInBank) ?? 0}
          icon={<BiSolidBank style={{ width: rem(15), height: rem(15) }} />}
        />
        <StatCard
          title="Defense Ratio"
          value={`${toLocale(defenseRatio * 100, user.locale)} %`}
          icon={<FontAwesomeIcon icon={faShield} style={{ width: rem(15), height: rem(15) }} />}
        />
      </SimpleGrid>
      {/* Add padding to the bottom of the main content area to prevent overlap with the fixed footer */}
      <Box style={{ paddingBottom: '100px' }}>
        {unitTypesIndex
          .filter((unitType) => unitType.unitData !== null) // Ensure unitData is loaded
          .map((unitType) => (
              <NewUnitSection
                heading={unitType.sectionTitle}
                units={unitType.unitData?.filter(u => u !== undefined) ?? []} // Filter out undefined and provide default
                updateTotalCost={updateTotalCost}
                unitCosts={unitCosts}
                setUnitCosts={setUnitCosts}
                unitType={unitType.type}
                key={unitType.type}
              />
          ))}
      </Box>
      {/* Sticky Footer */}
      <div
        ref={footerRef}
        className="bottom-0 z-10 w-full" // Ensure width and z-index
        style={{ position: 'relative' }} // Initial position
      >
        <ContentCard
          title="Order Summary"
          variant="highlight"
          className="border-t-2 border-yellow-600" // Example styling
        >
          <Flex justify='space-between' align="center" p="xs">
            <Stack gap="xs">
              <Text size='sm'>Total Cost: {toLocale(totalCost, user.locale)}</Text>
              <Text size='sm' c="dimmed">Refund: {toLocale(Math.floor(totalCost * 0.75), user.locale)}</Text>
            </Stack>
            <Group gap="sm">
              <Button
                color='green'
                onClick={handleTrainAll}
                disabled={totalCost <= 0 || BigInt(Math.ceil(totalCost)) > (user.gold ?? 0)} // Use Math.ceil to ensure integer
              >
                Train
              </Button>
              <Button
                color='red'
                onClick={handleUntrainAll}
                disabled={totalCost <= 0} // Basic check, more specific checks in handler
              >
                Untrain
              </Button>
            </Group>
          </Flex>
        </ContentCard>
      </div>
    </MainArea>
  );
};

export default Training;