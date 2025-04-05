import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import NewUnitSection from '@/components/newUnitSection';
import { EconomyUpgrades, Fortifications } from '@/constants'; 
import { useUser } from '@/context/users';
import { alertService } from '@/services'; 
import toLocale from '@/utils/numberFormatting'; 
import { Group, SimpleGrid, Text, Button, Flex, Stack, Box, rem } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPeopleGroup, faShield } from '@fortawesome/free-solid-svg-icons';
import MainArea from '@/components/MainArea';
import { PlayerUnit, UnitType, User } from '@/types/typings';
import StatCard from '@/components/StatCard';
import ContentCard from '@/components/ContentCard';
import { BiCoinStack, BiSolidBank } from 'react-icons/bi';
import { logDebug } from '@/utils/logger';


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
  usage: UnitType; // Added usage for potential icon mapping later if needed
  fortLevel: number; // Ensure fortLevel is part of the data
}

// Interface for the index structure (modified slightly)
interface UnitTypeIndex {
  type: UnitType; // Use the imported UnitType if available, otherwise string
  sectionTitle: string;
  unitData: UnitData[] | null;
  updateFn: React.Dispatch<React.SetStateAction<UnitData[] | null>>;
}

const Training: React.FC = () => { // Use React.FC for functional components
  const { user, forceUpdate } = useUser(); // Assuming useUser provides User | null type
  const [totalCost, setTotalCost] = useState(0);
  const [unitCosts, setUnitCosts] = useState<{ [key: string]: number }>({});

  // --- State declarations remain the same ---
  const [workerUnits, setWorkerUnits] = useState<UnitData[] | null>(null);
  const [offenseUnits, setOffenseUnits] = useState<UnitData[] | null>(null);
  const [defenseUnits, setDefenseUnits] = useState<UnitData[] | null>(null);
  const [spyUnits, setSpyUnits] = useState<UnitData[] | null>(null);
  const [sentryUnits, setSentryUnits] = useState<UnitData[] | null>(null);

  // --- Memoize unitTypesIndex ---
  const unitTypesIndex: UnitTypeIndex[] = useMemo(() => [
    { type: 'WORKER' as UnitType, sectionTitle: 'Economy', unitData: workerUnits, updateFn: setWorkerUnits },
    { type: 'OFFENSE' as UnitType, sectionTitle: 'Offense', unitData: offenseUnits, updateFn: setOffenseUnits },
    { type: 'DEFENSE' as UnitType, sectionTitle: 'Defense', unitData: defenseUnits, updateFn: setDefenseUnits },
    { type: 'SPY' as UnitType, sectionTitle: 'Spy', unitData: spyUnits, updateFn: setSpyUnits },
    { type: 'SENTRY' as UnitType, sectionTitle: 'Sentry', unitData: sentryUnits, updateFn: setSentryUnits },
  ], [workerUnits, offenseUnits, defenseUnits, spyUnits, sentryUnits]);

  /**
   * Gets an object representing the base state of the form, i.e., no units
   * being trained.
   */
  const getBlankSectionCosts = useCallback((): { [key: string]: number } => {
    return Object.fromEntries(
      unitTypesIndex.map((unitType) => [unitType.type, 0])
    );
  }, [unitTypesIndex]);

  const [sectionCosts, setSectionCosts] = useState(() => getBlankSectionCosts());

  /**
   * Update the total costs for the units currently slated to be trained in a section.
   * 
   */
  const updateTotalCost = useCallback((section: string, cost: number) => {
    logDebug(`updateTotalCost called with section: ${section}, cost: ${cost}`);
    // Ensure the incoming cost is a valid number, default to 0 if not
    const validatedCost = Number.isFinite(cost) ? cost : 0;

    setSectionCosts((prevCosts) => {
      const updatedCosts = { ...prevCosts, [section]: validatedCost }; // Use validatedCost

      // Recalculate total cost from the updated section costs
      const newTotalCost = Object.values(updatedCosts).reduce(
        (acc, curr) => acc + (Number.isFinite(curr) ? curr : 0), // Ensure 'curr' is added as a number
        0
      );

      // Ensure newTotalCost is not NaN before setting state
      setTotalCost(Number.isFinite(newTotalCost) ? newTotalCost : 0);
      return updatedCosts;
    });
  }, []);

  /**
   * Reset the unit costs to zero.
   */
  const resetUnitCosts = useCallback(() => {
    setUnitCosts({});
    setTotalCost(0);
    setSectionCosts(getBlankSectionCosts());
  }, [getBlankSectionCosts]);

  /**
   * Gives data about a specific unit. (Added usage and fortLevel)
   */
  const unitMapFunction = useCallback((unit: any, idPrefix: string): UnitData | undefined => {
    if (!user) {
      return undefined;
    }

    const bonus =
      unit.name === 'Worker'
        ? EconomyUpgrades?.[user.economyLevel]?.goldPerWorker
        : unit.bonus;

    const unitId = `${idPrefix}_${unit.level}`;
    const ownedUnit = user.units?.find((u: PlayerUnit) => u.type === unit.type && u.level === unit.level);
    const requirementFort = Fortifications.find((fort) => fort.level === unit.fortLevel);
    const baseCost = Number(String(unit.cost || '0').replace(/,/g, '')) || 0;
    // Ensure priceBonus is treated as a number, default to 0 if invalid
    const priceBonusPercent = Number(user.priceBonus || 0) / 100;
    return {
      id: unitId,
      name: unit.name,
      bonus: bonus ?? 0,
      ownedUnits: ownedUnit?.quantity || 0,
      requirement: requirementFort?.name || 'Unknown',
      cost: baseCost - (priceBonusPercent * baseCost),
      enabled: user.fortLevel !== undefined && unit.fortLevel <= user.fortLevel,
      level: unit.level,
      usage: unit.type as UnitType, // Add usage type
      fortLevel: unit.fortLevel, // Add fort level requirement
    };
  }, [user]);

  // --- useEffect for fetching unit data ---
  useEffect(() => {
    if (!user) return;
    if (user && user.availableUnitTypes) {
      let stateChanged = false;
      unitTypesIndex.forEach((unitType) => {
        const newUnitData = user.availableUnitTypes
          .filter((unit: any) => unit.type === unitType.type)
          .map((unit: any) => unitMapFunction(unit, unitType.type))
          .filter((unit): unit is UnitData => unit !== undefined);

        if (JSON.stringify(newUnitData) !== JSON.stringify(unitType.unitData)) {
          unitType.updateFn(newUnitData);
          stateChanged = true;
        }
      });
    }
  }, [user, unitMapFunction, unitTypesIndex]);


  /**
   * Get type, quantity, and level for each unit.
   */
  const getUnitQuantities = useCallback(() => {
    return unitTypesIndex.reduce<UnitData[]>((curVal, unitType) =>
      unitType.unitData ? [...curVal, ...unitType.unitData] : curVal,
      [])
      .filter((unit): unit is UnitData => unit !== null && unit.enabled)
      .map((unit) => {
        const unitComponents = unit.id.split('_');
        return {
          type: unitComponents[0] as UnitType,
          quantity: unitCosts[unit.id] || 0,
          level: parseInt(unitComponents[1], 10),
        };
      })
      .filter(unit => unit.quantity > 0);
  }, [unitTypesIndex, unitCosts]);

  // --- callTrainingApi, updateLocalUnits, handleFormSubmit (remain the same) ---
  const callTrainingApi = async (endpoint: 'train' | 'untrain', user: User, units: { type: UnitType; quantity: number; level: number }[]) => {
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
      console.error(`Error calling ${endpoint} API:`, error);
      throw new Error(error.message || `An unexpected error occurred during ${endpoint}.`);
    }
  };

  const updateLocalUnits = useCallback((data: any) => {
    if (!data?.data) return;
    const updatedUnitMap = new Map<string, number>();
    data.data.forEach((u: { type: UnitType; level: number; quantity: number }) => {
      updatedUnitMap.set(`${u.type}_${u.level}`, u.quantity);
    });
    unitTypesIndex.forEach((unitType) => {
      unitType.updateFn((prevUnits) => {
        if (!prevUnits) return null;
        return prevUnits.map((unit) => {
          const updatedQuantity = updatedUnitMap.get(unit.id);
          return updatedQuantity !== undefined ? { ...unit, ownedUnits: updatedQuantity } : unit;
        });
      });
    });
    resetUnitCosts();
    forceUpdate();
  }, [unitTypesIndex, resetUnitCosts, forceUpdate]);

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
    if (submitType === 'train' && totalCost > (Number(user.gold) ?? 0)) {
      alertService.error(`Insufficient gold. You need ${toLocale(totalCost, user.locale)} but only have ${toLocale(user.gold ?? 0, user.locale)}.`);
      return;
    }
    try {
      const data = await callTrainingApi(submitType, user, unitsToModify);
      if (data) {
        updateLocalUnits(data);
      }
    } catch (error: any) {
      alertService.error(error.message || `Failed to ${submitType} units. Please try again.`);
    }
  }, [user, getUnitQuantities, totalCost, updateLocalUnits]);


  const handleTrainAll = () => handleFormSubmit('train');
  const handleUntrainAll = () => handleFormSubmit('untrain');

  const parentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null); 

  useEffect(() => {
    const footerElement = footerRef.current;
    const scrollContainer = parentRef.current; // scrollContainer is still MainArea (parentRef)

    if (!footerElement || !scrollContainer) {
      return;
    };

    let lastKnownScrollPosition = 0; // Use window scroll position here
    let ticking = false;
    let lastWidth = ''; // Store last calculated width

    const handleScroll = () => {
      // --- CHANGE #1 ---
      lastKnownScrollPosition = window.scrollY; // Always use window scroll position

      if (!ticking) {
        window.requestAnimationFrame(() => {
          // Ensure elements still exist inside animation frame
          if (!footerElement || !scrollContainer) return;

          const scrollHeight = document.documentElement.scrollHeight; // Always use document height
          const clientHeight = window.innerHeight; // Always use window height

          const scrollableHeight = scrollHeight - clientHeight;
          const footerHeight = footerElement.offsetHeight;

          // Use lastKnownScrollPosition (which is window.scrollY)
          const isNearBottom = lastKnownScrollPosition >= scrollableHeight - (footerHeight + 10); // Added 10px buffer

          // Get parentRect for positioning the fixed element correctly
          const parentRect = scrollContainer.getBoundingClientRect();

          if (isNearBottom) {
            // Use relative positioning when at the bottom
            if (footerElement.style.position !== 'relative') {
              footerElement.style.position = 'relative'; // Relative to its normal position
              footerElement.style.bottom = 'auto'; // Reset bottom
              footerElement.style.left = 'auto'; // Reset left
              footerElement.style.width = 'auto'; // Reset width
            }
          } else {
            // Use fixed positioning when scrolling
            if (footerElement.style.position !== 'fixed') {
              footerElement.style.position = 'fixed';
              footerElement.style.bottom = '0'; // Stick to viewport bottom
              lastWidth = ''; // Force width update when switching to fixed
            }
            // Calculate width based on the scroll container's current dimensions and position
            const newWidth = `${parentRect.width}px`;
            if (lastWidth !== newWidth) { // Only update width if it changes
              footerElement.style.left = `${parentRect.left}px`;
              footerElement.style.width = newWidth;
              lastWidth = newWidth;
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check on mount

    // ResizeObserver remains important for width adjustments
    const resizeObserver = new ResizeObserver(() => {
      lastWidth = ''; // Force width recalculation on resize
      handleScroll(); // Re-run positioning logic on resize
    });
    // Ensure scrollContainer exists before observing
    if (scrollContainer) {
      resizeObserver.observe(scrollContainer);
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      // Ensure scrollContainer exists before unobserving
      if (scrollContainer) {
        resizeObserver.unobserve(scrollContainer); // Clean up observer
      }
    };
  }, []);

  if (!user) {
    return <MainArea title="Training"><Text>Loading user data...</Text></MainArea>;
  }

  // Calculate derived stats (ensure defaults/fallbacks)
  const citizenCount = user.units?.find(unit => unit.type === 'CITIZEN')?.quantity ?? 0;
  const defenseTotal = user.unitTotals?.defense ?? 0;
  const population = (user.population ?? 0) + citizenCount; // Include citizens in population for ratio
  const defenseRatio = population > 0 ? defenseTotal / population : 0; // Avoid division by zero

  return (
    <MainArea title="Training" ref={parentRef}>
      {/* *** USE StatCard instead of Paper *** */}
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} mb="lg">
        <StatCard
          title="Untrained Citizens"
          value={citizenCount}
          icon={<FontAwesomeIcon icon={faPeopleGroup} style={{ width: rem(15), height: rem(15) }} />}
        />
        <StatCard
          title="Gold On Hand"
          value={user.gold ?? 0}
          icon={<BiCoinStack style={{ width: rem(15), height: rem(15) }} />}
        />
        <StatCard
          title="Banked Gold"
          value={user.goldInBank ?? 0}
          icon={<BiSolidBank style={{ width: rem(15), height: rem(15) }} />}
        />
        <StatCard
          title="Defense Ratio"
          value={`${toLocale(defenseRatio * 100, user.locale)} %`} // Keep % sign logic
          icon={<FontAwesomeIcon icon={faShield} style={{ width: rem(15), height: rem(15) }} />}
        />
      </SimpleGrid>

      {/* Unit Sections - NewUnitSection will now be wrapped in ContentCard */}
      <Box style={{ paddingBottom: '100px' /* Add padding like Armory */ }}>
        {unitTypesIndex
          .filter((unitType) => unitType.unitData !== null)
          .map((unitType) => (
            
              <NewUnitSection
                heading={unitType.sectionTitle}
                units={unitType.unitData?.filter(u => u !== undefined) ?? []} // Pass valid units
                updateTotalCost={updateTotalCost} // Pass section type
                unitCosts={unitCosts}
                setUnitCosts={setUnitCosts}
              unitType={unitType.type}
              key={unitType.type} // Use unitType.type as key
              />
          ))}
      </Box>

      {/* --- Sticky Footer using div wrapper and ContentCard --- */}
      {/* Wrapper div for positioning and ref */}
      <div
        ref={footerRef}
        className="bottom-0 z-10 w-full"
        style={{ position: 'relative' /* Initial state, JS will toggle */ }}
      >
        {/* ContentCard for consistent styling */}
        <ContentCard
          title="Order Summary" // Optional title
          variant="highlight"
          className="border-t-2 border-yellow-600" 
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
                disabled={totalCost <= 0 || totalCost > (user.gold ?? 0)}
              >
                Train
              </Button>
              <Button
                color='red'
                onClick={handleUntrainAll}
                disabled={totalCost <= 0}
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