import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import Alert from '@/components/alert'; // Assuming this component exists
import NewUnitSection from '@/components/newUnitSection'; // Assuming this component exists
import { EconomyUpgrades, Fortifications } from '@/constants'; // Assuming these constants exist
import { useUser } from '@/context/users'; // Assuming this context exists
import { alertService } from '@/services'; // Assuming this service exists
import toLocale from '@/utils/numberFormatting'; // Assuming this utility exists
import { Paper, Group, SimpleGrid, Text, ThemeIcon, Badge, Tooltip, Button, Space, Flex, Stack, Box } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuildingColumns, faCoins, faPeopleGroup, faShield } from '@fortawesome/free-solid-svg-icons';
import MainArea from '@/components/MainArea'; // Assuming this component exists
import { PlayerUnit, UnitType, User } from '@/types/typings'; // Assuming types exist

// Define TypeScript interfaces for better type checking (restored from original)
interface UnitData {
  id: string;
  name: string;
  bonus: number;
  ownedUnits: number;
  requirement: string;
  cost: number;
  enabled: boolean;
  level: number;
}

// Interface for the index structure (modified slightly)
interface UnitTypeIndex {
  type: UnitType; // Use the imported UnitType if available, otherwise string
  sectionTitle: string;
  unitData: UnitData[] | null;
  updateFn: React.Dispatch<React.SetStateAction<UnitData[] | null>>;
}

const Training: React.FC = (props) => { // Use React.FC for functional components
  const { user, forceUpdate } = useUser(); // Assuming useUser provides User | null type
  const [totalCost, setTotalCost] = useState(0);
  const [unitCosts, setUnitCosts] = useState<{ [key: string]: number }>({});

  // --- Fix 1: Declare state directly ---
  const [workerUnits, setWorkerUnits] = useState<UnitData[] | null>(null);
  const [offenseUnits, setOffenseUnits] = useState<UnitData[] | null>(null);
  const [defenseUnits, setDefenseUnits] = useState<UnitData[] | null>(null);
  const [spyUnits, setSpyUnits] = useState<UnitData[] | null>(null);
  const [sentryUnits, setSentryUnits] = useState<UnitData[] | null>(null);

  // --- Memoize unitTypesIndex to ensure stability for useEffect dependency ---
  const unitTypesIndex: UnitTypeIndex[] = useMemo(() => [
    // Type assertion might be needed if UnitType doesn't directly match strings
    { type: 'WORKER' as UnitType, sectionTitle: 'Economy', unitData: workerUnits, updateFn: setWorkerUnits },
    { type: 'OFFENSE' as UnitType, sectionTitle: 'Offense', unitData: offenseUnits, updateFn: setOffenseUnits },
    { type: 'DEFENSE' as UnitType, sectionTitle: 'Defense', unitData: defenseUnits, updateFn: setDefenseUnits },
    { type: 'SPY' as UnitType, sectionTitle: 'Spy', unitData: spyUnits, updateFn: setSpyUnits },
    { type: 'SENTRY' as UnitType, sectionTitle: 'Sentry', unitData: sentryUnits, updateFn: setSentryUnits },
  ], [workerUnits, offenseUnits, defenseUnits, spyUnits, sentryUnits]); // Depend on the state values

  /**
   * Gets an object representing the base state of the form, i.e., no units
   * being trained.
   * Memoized because unitTypesIndex is now memoized and stable.
   */
  const getBlankSectionCosts = useCallback((): { [key: string]: number } => {
    return Object.fromEntries(
      unitTypesIndex.map((unitType) => [unitType.type, 0])
    );
  }, [unitTypesIndex]); // Depend on the stable unitTypesIndex

  const [sectionCosts, setSectionCosts] = useState(() => getBlankSectionCosts());

  /**
   * Update the total costs for the units currently slated to be trained in a section.
   * No dependencies needed for useCallback as it only uses its arguments and setState.
   */
  const updateTotalCost = useCallback((section: string, cost: number) => {
    setSectionCosts((prevCosts) => {
      const updatedCosts = { ...prevCosts, [section]: cost };
      const newTotalCost = Object.values(updatedCosts).reduce(
        (acc, curr) => acc + curr,
        0
      );
      setTotalCost(newTotalCost);
      return updatedCosts;
    });
  }, []); // No dependencies needed

  /**
   * Reset the unit costs to zero.
   * Use useCallback and include dependencies.
   */
  const resetUnitCosts = useCallback(() => {
    setUnitCosts({});
    setTotalCost(0);
    setSectionCosts(getBlankSectionCosts());
  }, [getBlankSectionCosts]); // Depends on getBlankSectionCosts

  /**
   * Gives data about a specific unit.
   * Use useCallback and specify exact user properties needed as dependencies for stability.
   */
  const unitMapFunction = useCallback((unit: any, idPrefix: string): UnitData | undefined => {
    if (!user) {
      return undefined;
    }

    // --- Fix 4: Optional chaining for safety ---
    const bonus =
      unit.name === 'Worker'
        ? EconomyUpgrades?.[user.economyLevel]?.goldPerWorker // Added optional chaining
        : unit.bonus;

    const unitId = `${idPrefix}_${unit.level}`;

    // --- Fix 4: Optional chaining for safety ---
    const ownedUnit = user.units?.find((u: PlayerUnit) => u.type === unit.type && u.level === unit.level);
    const requirementFort = Fortifications.find((fort) => fort.level === unit.fortLevel);

    return {
      id: unitId,
      name: unit.name,
      bonus: bonus ?? 0, // Provide a fallback if bonus calculation fails
      ownedUnits: ownedUnit?.quantity || 0,
      requirement: requirementFort?.name || 'Unknown', // Provide fallback
      cost: unit.cost - (user.priceBonus / 100) * unit.cost,
      enabled: user.fortLevel !== undefined && unit.fortLevel <= user.fortLevel, // Check fortLevel exists
      level: unit.level,
    };
  }, [user]);

  // --- Fix 2: Add unitTypesIndex to dependency array ---
  useEffect(() => {
    if (!user) return;
    if (user && user.availableUnitTypes) {
      // console.log("Updating unit data based on user change", user.id); // Debug log
      let stateChanged = false;
      unitTypesIndex.forEach((unitType) => {
        const newUnitData = user.availableUnitTypes
          .filter((unit: any) => unit.type === unitType.type)
          .map((unit: any) => unitMapFunction(unit, unitType.type))
          .filter((unit): unit is UnitData => unit !== undefined); // Ensure only valid UnitData

        // Only update state if the data has actually changed (simple JSON compare)
        if (JSON.stringify(newUnitData) !== JSON.stringify(unitType.unitData)) {
          // console.log(`Updating state for ${unitType.type}`); // Debug log
          unitType.updateFn(newUnitData);
          stateChanged = true;
        }
      });
    }
  }, [user, unitMapFunction, unitTypesIndex]);

  /**
   * Get type, quantity, and level for each unit.
   * Use useCallback and include dependencies.
   */
  const getUnitQuantities = useCallback(() => {
    // --- Fix 4: Optional chaining/filtering for safety ---
    return unitTypesIndex.reduce<UnitData[]>((curVal, unitType) =>
      unitType.unitData ? [...curVal, ...unitType.unitData] : curVal,
      [])
      .filter((unit): unit is UnitData => unit !== null && unit.enabled) // Ensure unit is not null and enabled
      .map((unit) => {
        const unitComponents = unit.id.split('_');
        return {
          type: unitComponents[0] as UnitType, // Type assertion
          quantity: unitCosts[unit.id] || 0,
          level: parseInt(unitComponents[1], 10),
        };
      })
      // Filter out units with 0 quantity to avoid sending unnecessary data
      .filter(unit => unit.quantity > 0);
  }, [unitTypesIndex, unitCosts]); // Depend on unit data states and costs


  /**
   * Calls the named training API endpoint.
   * No useCallback needed as it's called directly by event handlers.
   */
  const callTrainingApi = async (endpoint: 'train' | 'untrain', user: User, units: { type: UnitType; quantity: number; level: number }[]) => {
    // Don't call API if there are no units to modify
    if (units.length === 0) {
      alertService.warn(`No units selected to ${endpoint}.`);
      return null; // Indicate no API call was made
    }

    try {
      const response = await fetch(`/api/training/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, units: units }),
      });

      const data = await response.json(); // Try to parse JSON regardless of status

      if (!response.ok) {
        // Use error message from API if available, otherwise generic message
        throw new Error(data?.error || `Calling training API endpoint ${endpoint} failed with status ${response.status}.`);
      }

      alertService.success(data.message || `${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)} successful!`);
      return data;

    } catch (error: any) {
      console.error(`Error calling ${endpoint} API:`, error);
      // Rethrow the specific error for the handler
      throw new Error(error.message || `An unexpected error occurred during ${endpoint}.`);
    }
  };


  /**
   * Updates the units on the page after a successful API call.
   * Use useCallback and include dependencies.
   */
  const updateLocalUnits = useCallback((data: any) => {
    if (!data?.data) return; // Guard against missing data

    // Assuming data.data is the updated user.units array or similar structure
    const updatedUnitMap = new Map<string, number>();
    data.data.forEach((u: { type: UnitType; level: number; quantity: number }) => {
      updatedUnitMap.set(`${u.type}_${u.level}`, u.quantity);
    });

    unitTypesIndex.forEach((unitType) => {
      unitType.updateFn((prevUnits) => {
        if (!prevUnits) return null; // If no previous units, return null
        return prevUnits.map((unit) => {
          const updatedQuantity = updatedUnitMap.get(unit.id);
          // Only update if the quantity exists in the response, otherwise keep current
          return updatedQuantity !== undefined ? { ...unit, ownedUnits: updatedQuantity } : unit;
        });
      });
    });

    resetUnitCosts(); // Reset form costs
    forceUpdate(); // Trigger user context update if necessary
  }, [unitTypesIndex, resetUnitCosts, forceUpdate]); // Dependencies


  /**
   * Handles either a train or untrain action.
   * Use useCallback to memoize the handler function.
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

    // --- Client-side cost check for 'train' ---
    if (submitType === 'train' && totalCost > (Number(user.gold) ?? 0)) {
      alertService.error(`Insufficient gold. You need ${toLocale(totalCost, user.locale)} but only have ${toLocale(user.gold ?? 0, user.locale)}.`);
      return;
    }

    try {
      const data = await callTrainingApi(submitType, user, unitsToModify);
      if (data) { // Only update if API call was successful and returned data
        updateLocalUnits(data);
      }
    } catch (error: any) {
      // Error already logged in callTrainingApi, just show alert
      alertService.error(error.message || `Failed to ${submitType} units. Please try again.`);
    }
  }, [user, getUnitQuantities, totalCost, updateLocalUnits]);

  // Event handlers (no need for useCallback if just calling another memoized function)
  const handleTrainAll = () => handleFormSubmit('train');
  const handleUntrainAll = () => handleFormSubmit('untrain');

  // Refs for sticky element
  const parentRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  // Sticky footer logic (keep dependencies minimal)
  useEffect(() => {
    const scrollHandler = () => {
      const stickyElement = stickyRef.current;
      const parentElement = parentRef.current;

      if (!stickyElement || !parentElement) return;

      const { bottom: parentBottom } = parentElement.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Check if element reference is still valid before accessing style
      if (stickyElement) {
        if (parentBottom <= windowHeight) {
          stickyElement.style.position = 'absolute';
          stickyElement.style.bottom = '0';
          stickyElement.style.width = '100%'; // Match parent width when absolute
        } else {
          stickyElement.style.position = 'fixed';
          stickyElement.style.bottom = '0';
          // Consider getting width dynamically or using CSS for better responsiveness
          stickyElement.style.width = 'calc(100% - 2rem)'; // Example: Adjust based on MainArea padding
          stickyElement.style.maxWidth = '1200px'; // Keep max width
        }
      }
    };


    window.addEventListener('scroll', scrollHandler);
    // Initial call to set position correctly on load
    scrollHandler();

    // Cleanup listener
    return () => {
      window.removeEventListener('scroll', scrollHandler);
    };
  }, []); // Empty dependency array: only runs on mount and unmount


  // --- Render Logic ---

  // Loading or no user state
  if (!user) {
    return <MainArea title="Training"><Text>Loading user data...</Text></MainArea>;
  }

  const citizenCount = user.units?.find(unit => unit.type === 'CITIZEN')?.quantity ?? 0;
  const defenseTotal = user.unitTotals?.defense ?? 0;
  const population = user.population ?? 1; // Avoid division by zero
  const defenseRatio = defenseTotal / population;


  return (
    <MainArea title="Training" ref={parentRef}>
      <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} mb="lg">
        {/* --- Fix 4 & 5: Add key, optional chaining, default values --- */}
        <Paper withBorder p="md" radius={'md'} key='UntrainedCitz'>
          <Group justify='space-between'>
            <Text size="lg" fw={'bold'} c="dimmed">Untrained Citizens</Text>
            <ThemeIcon c='white' variant="transparent"> {/* Use variant transparent or similar */}
              <FontAwesomeIcon icon={faPeopleGroup} />
            </ThemeIcon>
          </Group>
          <Group>
            <Text>{toLocale(citizenCount, user.locale)}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="md" radius={'md'} key='GoldOnHand'>
          <Group justify='space-between'>
            <Text size="lg" fw={'bold'} c="dimmed">Gold On Hand</Text>
            <ThemeIcon c='white' variant="transparent">
              <FontAwesomeIcon icon={faCoins} />
            </ThemeIcon>
          </Group>
          <Group>
            <Text>{toLocale(user.gold ?? 0, user.locale)}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="md" radius={'md'} key='BankedGold'>
          <Group justify='space-between'>
            <Text size="lg" fw={'bold'} c="dimmed">Banked Gold</Text>
            <ThemeIcon c='white' variant="transparent">
              <FontAwesomeIcon icon={faBuildingColumns} />
            </ThemeIcon>
          </Group>
          <Group>
            <Text>{toLocale(user.goldInBank ?? 0, user.locale)}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="md" radius={'md'} key='DefenseToPopulation'>
          <Group justify='space-between'>
            <Text size="lg" fw={'bold'} c="dimmed">Defense Ratio</Text>
            <ThemeIcon c='white' variant="transparent">
              <FontAwesomeIcon icon={faShield} />
            </ThemeIcon>
          </Group>
          <Group align="flex-end"> {/* Align items to bottom */}
            <Text>{toLocale(defenseRatio * 100, user.locale, 1)} %</Text> {/* Added 1 decimal place */}
            {defenseRatio < 0.25 && (
              <Tooltip label='It is recommended that you have at least 25% Defense along with a healthy Fort. You may take heavier losses and your Workers and Citizens may be at risk!' multiline w={250}>
                <Badge color="orange" variant='light' size='sm' style={{ cursor: 'help' }}>Advisor: Low</Badge>
              </Tooltip>
            )}
          </Group>
        </Paper>
      </SimpleGrid>

      {/* --- Fix 3: Add key prop --- */}
      {unitTypesIndex
        .filter((unitType) => unitType.unitData !== null) // Filter out sections with no data loaded yet
        .map((unitType) => (
          <NewUnitSection
            key={unitType.type} // Added unique key
            heading={unitType.sectionTitle}
            units={unitType.unitData?.filter((unit) => unit.enabled) ?? []} // Optional chaining and fallback
            updateTotalCost={(cost) => updateTotalCost(unitType.type, cost)}
            unitCosts={unitCosts}
            setUnitCosts={setUnitCosts}
            locale={user.locale} // Pass locale for number formatting inside section
          />
        ))}

      {/* Sticky Footer */}
      <Box style={{ height: '80px' }} /> {/* Add spacer to prevent content overlap */}
      <Paper
        ref={stickyRef}
        shadow="md"
        p="xs" // Reduced padding
        radius="md"
        withBorder
        style={{
          position: 'fixed', // Initial state
          bottom: 0,
          left: 'auto', // Let MainArea control horizontal position
          right: 'auto',
          zIndex: 10,
          backgroundColor: 'var(--mantine-color-body)', // Use theme background
          // Width and maxWidth will be set by the effect
        }}
      // Use className for potential Tailwind/CSS module styling if preferred
      >
        <Flex justify='space-between' align="center">
          <Stack gap="xs">
            <Text size='sm'>Total Cost: {toLocale(totalCost, user.locale)}</Text>
            <Text size='sm' c="dimmed">Refund: {toLocale(Math.floor(totalCost * 0.75), user.locale)}</Text> {/* Use floor for refund */}
          </Stack>
          <Group gap="sm"> {/* Use Group for spacing */}
            <Button
              color='green' // Use semantic colors
              onClick={handleTrainAll}
              disabled={totalCost <= 0 || totalCost > (user.gold ?? 0)} // Disable if no cost or insufficient gold
            >
              Train
            </Button>
            <Button
              color='red' // Use semantic colors
              onClick={handleUntrainAll}
              disabled={totalCost <= 0} // Disable if no cost (nothing to untrain selected)
            >
              Untrain
            </Button>
          </Group>
        </Flex>
      </Paper>
    </MainArea>
  );
};

export default Training;