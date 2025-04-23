import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { NumberInput, Group, Text, Table, Select, Button, Box, Stack, Flex, Tooltip } from '@mantine/core';
import toLocale from '@/utils/numberFormatting';
import { alertService } from '@/services';
import { useUser } from '@/context/users';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQuestionCircle, faCoins, faShieldHalved, faUserSecret, faEye, faHammer, faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import ContentCard from './ContentCard';
import RpgAwesomeIcon from './RpgAwesomeIcon';
import { logError, logInfo } from '@/utils/logger';
import ImageWithFallback from './ImagWithFallback';
import { PlayerUnit, UnitProps, UnitType } from '@/types/typings';

/**
 * Formats a section heading string to title case.
 * @param secHeading - The raw heading string (e.g., "OFFENSE UNITS").
 * @returns The formatted heading string (e.g., "Offense Units").
 */
const formatHeading = (secHeading: string): string => {
  return secHeading
    .split(' ')
    .map((word) =>
      word.length > 0 ? word[0].toUpperCase() + word.substring(1).toLowerCase() : ''
    )
    .join(' ');
};

/**
 * Gets the appropriate FontAwesome or RPG Awesome icon based on the section heading.
 * @param heading - The section heading string.
 * @returns A React element representing the icon.
 */
const getSectionIcon = (heading: string) => {
  const lowerHeading = heading.toLowerCase();
  if (lowerHeading.includes('economy') || lowerHeading.includes('worker')) {
    return <FontAwesomeIcon icon={faCoins} />;
  }
  if (lowerHeading.includes('offense')) {
    return <RpgAwesomeIcon icon="crossed-swords" />;
  }
  if (lowerHeading.includes('defense')) {
    return <FontAwesomeIcon icon={faShieldHalved} />;
  }
  if (lowerHeading.includes('spy')) {
    return <FontAwesomeIcon icon={faUserSecret} />;
  }
  if (lowerHeading.includes('sentry')) {
    return <FontAwesomeIcon icon={faEye} />;
  }
  return <FontAwesomeIcon icon={faQuestionCircle} />; // Default icon
};

/**
 * Props for the NewUnitSection component.
 */
type NewUnitSectionProps = {
  /** The title/heading for this unit section (e.g., "OFFENSE"). */
  heading: string;
  /** Array of unit data objects to display in this section. */
  units: UnitProps[];
  /** Callback to update the total cost in the parent component for this specific unit type. */
  updateTotalCost: (sectionType: UnitType, cost: number) => void;
  /** State object mapping unit IDs to their quantities for train/untrain actions. */
  unitCosts: { [key: string]: number };
  /** Function to update the unitCosts state. */
  setUnitCosts: React.Dispatch<React.SetStateAction<{ [key: string]: number }>>;
  /** The type of units in this section (e.g., 'OFFENSE', 'DEFENSE'). */
  unitType: UnitType;
};

/**
 * A component section displaying units of a specific type (e.g., Offense, Defense).
 * Allows users to train, untrain, and convert units within the section.
 * Displays unit details, costs, owned quantities, and handles API interactions.
 */
const NewUnitSection: React.FC<NewUnitSectionProps> = ({
  heading,
  units,
  updateTotalCost,
  unitCosts,
  setUnitCosts,
  unitType,
}) => {
  const { user, forceUpdate } = useUser();
  const [currentUnits, setCurrentUnits] = useState(units);
  const [conversionAmount, setConversionAmount] = useState<number>(0);
  const [fromUnitId, setFromUnitId] = useState<string | null>(null);
  const [toUnitId, setToUnitId] = useState<string | null>(null);
  const [conversionCost, setConversionCost] = useState(0);
  const [toLower, setToLower] = useState(false);
  const [collapsedItems, setCollapsedItems] = useState<{ [key: string]: boolean }>({});
  const [highestUnlockedLevel, setHighestUnlockedLevel] = useState(0);
  const [trainUntrainError, setTrainUntrainError] = useState<string | null>(null); // State for train/untrain errors
  const [convertError, setConvertError] = useState<string | null>(null); // State for convert errors
  const [isProcessingTrain, setIsProcessingTrain] = useState(false); // Loading state for train
  const [isProcessingUntrain, setIsProcessingUntrain] = useState(false); // Loading state for untrain
  const [isProcessingConvert, setIsProcessingConvert] = useState(false); // Loading state for convert

  useEffect(() => {
    setCurrentUnits(units);
  }, [units]);


  // Effect to calculate conversion cost
  useEffect(() => {
    if (!fromUnitId || !toUnitId || !units) {
      setConversionCost(0);
      return;
    }
    const fromUnitData = units.find((item) => item.id === fromUnitId);
    const toUnitData = units.find((item) => item.id === toUnitId);

    if (!fromUnitData || !toUnitData || fromUnitData.level === undefined || toUnitData.level === undefined) {
      setConversionCost(0);
      return;
    };

    const isLower = fromUnitData.level > toUnitData.level;
    setToLower(isLower);

    const fromCostNum = Number(String(fromUnitData.cost).replace(/,/g, '')) || 0;
    const toCostNum = Number(String(toUnitData.cost).replace(/,/g, '')) || 0;

    const costDifference = toCostNum - fromCostNum;
    const multiplier = isLower ? 0.75 : 1.0; // 75% refund factor when converting down, 100% cost when converting up

    let calculatedCost = conversionAmount * costDifference * multiplier;

    // If converting lower, the 'cost' is actually a refund (negative cost), but we display it positively.
    // If converting higher, the cost is positive.
    if (isLower) {
      calculatedCost = Math.abs(calculatedCost); // Show refund amount as positive
    }


    setConversionCost(calculatedCost);

  }, [fromUnitId, toUnitId, conversionAmount, units]);

  /**
   * Handles changes in the NumberInput fields for unit quantities.
   * Updates the unitCosts state and recalculates the total cost for the section.
   * @param unitId - The ID of the unit whose quantity is being changed.
   * @param value - The new value from the NumberInput.
   */
  const handleInputChange = useCallback((unitId: string, value: number | string | undefined) => {
    const numericValue = value === undefined || value === '' || isNaN(Number(value)) ? 0 : Math.max(0, Number(value));
    const newCosts = {
      ...unitCosts,
      [unitId]: numericValue,
    };
    setUnitCosts(newCosts);

    // Recalculate section cost after state update
    let sectionCost = 0;
    units.forEach((unit) => {
      const cost = newCosts[unit.id] || 0;
      const unitCostValue = Number(String(unit.cost).replace(/,/g, '')) || 0;
      sectionCost += cost * unitCostValue;
    });
    if (isNaN(sectionCost)) {
      logError(`[NewUnitSection] Calculated sectionCost is NaN for section ${unitType}. Resetting to 0.`);
      sectionCost = 0; // Prevent passing NaN up
    }
    updateTotalCost(unitType, sectionCost);

  }, [unitCosts, setUnitCosts, units, updateTotalCost, unitType]);

  // Calculate cost for *this section only* for the section footer
  const sectionTotalCost = useMemo(() => {
    let cost = 0;
    if (!units) return 0;
    units.forEach((unit) => {
      const quantity = unitCosts[unit.id] || 0;
      const unitCostValue = Number(String(unit.cost).replace(/,/g, '')) || 0;
      cost += quantity * unitCostValue;
    });
    return cost;
  }, [units, unitCosts]);

  /**
   * Resets the input quantities for all units within this section to zero
   * and updates the total cost in the parent component.
   */
  const resetSectionCosts = useCallback(() => {
    const sectionUnitIds = units.map(u => u.id);
    const newCosts = { ...unitCosts };
    let didReset = false;

    sectionUnitIds.forEach(id => {
      if (newCosts[id] && newCosts[id] > 0) {
        delete newCosts[id];
        didReset = true;
      }
    });

    // Only update state and parent total if something was actually reset
    if (didReset) {
      setUnitCosts(newCosts);
      // Tell the parent Training component this section's cost is now 0
      updateTotalCost(unitType, 0);
    }

  }, [units, unitCosts, setUnitCosts, updateTotalCost, unitType]);


  /**
   * Handles the "Train Section" action.
   * Gathers units with quantities > 0, validates gold and citizen requirements,
   * sends a request to the '/api/training/train' endpoint, and updates state.
   */
  const handleTrainSection = useCallback(async () => {
    if (isProcessingTrain || isProcessingUntrain || isProcessingConvert) return;
    setIsProcessingTrain(true);
    setTrainUntrainError(null);

    if (!user) {
      setTrainUntrainError('User data not available.');
      setIsProcessingTrain(false);
      return;
    }
    const unitsToTrain = units
      .map(unit => ({
        ...unit,
        quantity: unitCosts[unit.id] || 0,
      }))
      .filter(unit => unit.quantity > 0 && unit.enabled);

    if (unitsToTrain.length === 0) {
      setTrainUntrainError(`No ${heading} units selected to train.`);
      setIsProcessingTrain(false);
      return;
    }

    const currentSectionCost = unitsToTrain.reduce((acc, unit) => {
      const unitCostValue = Number(String(unit.cost).replace(/,/g, '')) || 0;
      return acc + Math.ceil((unit.quantity * unitCostValue));
    }, 0);


    const userGold = BigInt(user.gold?.toString() ?? '0');
    if (BigInt(currentSectionCost) > userGold) {
      setTrainUntrainError(`Insufficient gold. Needs ${toLocale(currentSectionCost, user.locale)}.`);
      setIsProcessingTrain(false);
      return;
    }

    // Check citizens
    const citizensRequired = unitsToTrain.reduce((acc, unit) => acc + unit.quantity, 0);
    const availableCitizens = user.units?.find(u => u.type === 'CITIZEN' && u.level === 1)?.quantity ?? 0;
    if (citizensRequired > availableCitizens) {
        setTrainUntrainError(`Insufficient citizens. Needs ${toLocale(citizensRequired, user.locale)}, have ${toLocale(availableCitizens, user.locale)}.`);
        setIsProcessingTrain(false);
        return;
    }

    const apiPayload = unitsToTrain.map(unit => ({
      type: unitType,
      quantity: unit.quantity,
      level: unit.level,
    }));


    try {
      const response = await fetch('/api/training/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, units: apiPayload }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `Training ${heading} units failed.`);
      }
      alertService.success(data.message || `${heading} units trained successfully!`);
      resetSectionCosts();
      forceUpdate();
    } catch (error: any) {
      logError(`Error training ${heading} units:`, error);
      setTrainUntrainError(error.message || `Failed to train ${heading} units.`);
    } finally {
        setIsProcessingTrain(false);
    }
  }, [user, units, unitCosts, unitType, heading, resetSectionCosts, forceUpdate, isProcessingConvert, isProcessingTrain, isProcessingUntrain]);

  /**
   * Handles the "Untrain Section" action.
   * Gathers units with quantities > 0, validates ownership,
   * sends a request to the '/api/training/untrain' endpoint, and updates state.
   */
  const handleUntrainSection = useCallback(async () => {
    if (isProcessingTrain || isProcessingUntrain || isProcessingConvert) return;
    setIsProcessingUntrain(true);
    setTrainUntrainError(null);

     if (!user) {
      setTrainUntrainError('User data not available.');
      setIsProcessingUntrain(false);
      return;
    }
    const unitsToUntrain = units
      .map(unit => ({
        ...unit,
        quantity: unitCosts[unit.id] || 0,
      }))
      .filter(unit => unit.quantity > 0 && unit.enabled);

    if (unitsToUntrain.length === 0) {
      setTrainUntrainError(`No ${heading} units selected to untrain.`);
      setIsProcessingUntrain(false);
      return;
    }

    // Check if user owns enough of each unit *in this section*
    for (const unit of unitsToUntrain) {
        const owned = unit.ownedUnits || 0;
        if (unit.quantity > owned) {
            setTrainUntrainError(`Not enough ${unit.name} to untrain (Own: ${toLocale(owned, user.locale)}).`);
            setIsProcessingUntrain(false);
            return;
        }
    }

    const apiPayload = unitsToUntrain.map(unit => ({
      type: unitType,
      quantity: unit.quantity,
      level: unit.level,
    }));

    try {
      const response = await fetch('/api/training/untrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, units: apiPayload }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `Untraining ${heading} units failed.`);
      }
      alertService.success(data.message || `${heading} units untrained successfully!`);
      resetSectionCosts();
      forceUpdate();
    } catch (error: any) {
      logError(`Error untraining ${heading} units:`, error);
      setTrainUntrainError(error.message || `Failed to untrain ${heading} units.`);
    } finally {
        setIsProcessingUntrain(false);
    }
  }, [user, units, unitCosts, unitType, heading, resetSectionCosts, forceUpdate, isProcessingConvert, isProcessingTrain, isProcessingUntrain]);


  // Get memoized list of units (no filtering needed here as collapsing handles visibility)
  const getUnits = useMemo(() => {
    // Sort units by level for consistent display order
    return [...units].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  }, [units]);

  /**
   * Resets the state variables related to the unit conversion form.
   */
  const resetConversion = useCallback(() => {
    setConversionAmount(0);
    setFromUnitId(null);
    setToUnitId(null);
    setConversionCost(0);
    setToLower(false);
  }, []);

  /**
   * Handles the "Convert" action.
   * Validates selected units, quantity, and gold, sends a request to the
   * '/api/training/convert' endpoint, and updates state.
   */
  const handleConvert = useCallback(async () => {
    if (isProcessingTrain || isProcessingUntrain || isProcessingConvert) return;
    setIsProcessingConvert(true);
    setConvertError(null);

    if (!fromUnitId || !toUnitId || !conversionAmount || conversionAmount <= 0) {
      setConvertError('Select units and enter quantity > 0.');
      setIsProcessingConvert(false);
      return;
    }
    if (!user) {
       setConvertError('User data not available.');
       setIsProcessingConvert(false);
      return;
    }

    const fromUnitData = getUnits.find((item) => item.id === fromUnitId);
    if (!fromUnitData) {
      setConvertError('Invalid "from" unit selected.');
      setIsProcessingConvert(false);
      return;
    }
    if ((fromUnitData.ownedUnits || 0) < conversionAmount) {
      setConvertError(`Not enough ${fromUnitData.name} to convert (Own: ${toLocale(fromUnitData.ownedUnits || 0, user.locale)}).`);
      setIsProcessingConvert(false);
      return;
    }

    const userGold = BigInt(user.gold?.toString() ?? '0');
    if (!toLower && BigInt(Math.ceil(conversionCost)) > userGold) {
      setConvertError(`Insufficient gold (Cost: ${toLocale(conversionCost, user.locale)}).`);
      setIsProcessingConvert(false);
      return;
    }


    try {
      const response = await fetch('/api/training/convert', { // Use training API endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          fromUnit: fromUnitId, // API expects fromUnit
          toUnit: toUnitId,     // API expects toUnit
          conversionAmount: conversionAmount, // API expects conversionAmount
          locale: user?.locale || 'en-US',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unit conversion failed.');
      }

      alertService.success(data.message || 'Conversion successful!');
      resetConversion();
      forceUpdate(); // Update user context to reflect changes

    } catch (error: any) {
      logError('Failed to convert units:', error);
      setConvertError(error.message || 'Conversion failed. Please try again.');
    } finally {
        setIsProcessingConvert(false);
    }
  }, [user, fromUnitId, toUnitId, conversionAmount, conversionCost, toLower, getUnits, resetConversion, forceUpdate, isProcessingConvert, isProcessingTrain, isProcessingUntrain]);

  /**
   * Toggles the collapsed/expanded state of a specific unit row in the table.
   * @param unitId - The ID of the unit row to toggle.
   */
  const toggleCollapse = (unitId: string) => {
    setCollapsedItems((prevState) => ({
      ...prevState,
      [unitId]: !prevState[unitId],
    }));
  };

  // Filter units for conversion dropdowns
  const availableUnitsForConversion = useMemo(() =>
    getUnits.filter(unit => unit.enabled).map(unit => ({ value: unit.id, label: unit.name }))
    , [getUnits]);

  const availableFromUnits = useMemo(() =>
    getUnits.filter(unit => unit.enabled && (unit.ownedUnits || 0) > 0).map(unit => ({ value: unit.id, label: unit.name }))
    , [getUnits]);

  const availableToUnits = useMemo(() =>
    availableUnitsForConversion.filter(unit => unit.value !== fromUnitId)
    , [availableUnitsForConversion, fromUnitId]);

  /**
   * Generates the S3 URL for the character's image based on its type, level, and user's race.
   * Includes fallback logic.
   * @param unit - The unit data.
   * @returns The URL string for the character image.
   */
  const getCharacterImage = (unit: UnitProps) => {
    if (!unit || !user) {
      return `${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/Characters/default-character.webp`; // Fallback image
    }

    // Get the base name from the unit ID (like "WORKER" from "WORKER_1")
    const baseUnitName = unit.id.split('_')[0].charAt(0).toUpperCase() + unit.id.split('_')[0].slice(1).toLowerCase();

    // Convert race to proper case (e.g., "ELF" to "Elf")
    const raceProperCase = user.race ?
      user.race.charAt(0).toUpperCase() + user.race.slice(1).toLowerCase() :
      'Human'; // Default to Human if race not specified

    return `${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/Characters/${raceProperCase}/L${unit.level}${baseUnitName}.webp`;
  }

const userGold = BigInt(user?.gold?.toString() ?? '0');
const trainDisabled = sectionTotalCost <= 0 || BigInt(Math.ceil(sectionTotalCost)) > userGold || isProcessingTrain || isProcessingUntrain || isProcessingConvert;
// Add check for owned units for untrain if needed (currently done inside handler)
const untrainDisabled = sectionTotalCost <= 0 || isProcessingTrain || isProcessingUntrain || isProcessingConvert;

const trainTooltip =
    sectionTotalCost <= 0 ? 'Enter quantities to train.' :
    BigInt(Math.ceil(sectionTotalCost)) > userGold ? `Not enough gold (Cost: ${toLocale(sectionTotalCost, user?.locale)})` :
    '';
const untrainTooltip = sectionTotalCost <= 0 ? 'Enter quantities to untrain.' : '';


const footerContent = (
  <>
    {/* Inline Error Display for Train/Untrain */}
    {trainUntrainError && (
        <Text color="red" size="sm" ta="center" mb="xs">
            {trainUntrainError}
        </Text>
    )}
    <Flex justify='space-between' align="center" p="xs">
      <Stack gap="xs">
        <Text size='sm'>Section Cost: {toLocale(sectionTotalCost, user?.locale)}</Text>
        <Text size='sm' c="dimmed">Section Refund: {toLocale(Math.floor(sectionTotalCost * 0.75), user?.locale)}</Text>
      </Stack>
      <Group gap="sm">
        <Tooltip label={trainTooltip} disabled={!trainDisabled || isProcessingTrain} withArrow>
          <div style={{ width: 'auto' }}> {/* Wrapper for disabled tooltip */}
            <Button
              color='green'
              onClick={handleTrainSection}
              disabled={trainDisabled}
              loading={isProcessingTrain}
              size="xs"
            >
              Train Section
            </Button>
          </div>
        </Tooltip>
        <Tooltip label={untrainTooltip} disabled={!untrainDisabled || isProcessingUntrain} withArrow>
           <div style={{ width: 'auto' }}> {/* Wrapper for disabled tooltip */}
              <Button
                color='red'
                onClick={handleUntrainSection}
                disabled={untrainDisabled}
                loading={isProcessingUntrain}
                size="xs"
              >
                Untrain Section
              </Button>
           </div>
        </Tooltip>
      </Group>
    </Flex>
  </>
);

return (
  <ContentCard
    title={formatHeading(heading)}
    icon={getSectionIcon(heading)}
    iconPosition="title-left"
    className="my-6"
    footer={footerContent}
  >
    <Table striped highlightOnHover verticalSpacing="sm">
      <Table.Tbody>
        {getUnits.map((unit) => {
          const isCollapsed = collapsedItems[unit.id] ?? false;
          // Determine if this is the *first* disabled unit to show its requirement
          // This logic is simplified compared to the original, focusing on enabled/disabled state

          if (unit.enabled) {
            return (
              <Table.Tr key={unit.id}>
                {/* Unit Name, Bonus, Cost */}
                <Table.Td style={{ width: '40%' }}>
                  <Group gap={'sm'} align="flex-start" wrap="nowrap">
                    <Box onClick={() => toggleCollapse(unit.id)} style={{ cursor: 'pointer', paddingTop: '4px' }} aria-expanded={!isCollapsed} role="button">
                      {isCollapsed ? <FontAwesomeIcon icon={faPlus} size="sm" /> : <FontAwesomeIcon icon={faMinus} size="sm" />}
                    </Box>
                    {process.env.NEXT_PUBLIC_SHOW_AI_IMAGES ? (
                      <ImageWithFallback
                        fallbackSrc={`${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/Characters/default-character.webp`} // Fallback image
                        src={getCharacterImage(unit)}
                        alt={unit.name}
                        width={80}
                        height={80}
                        className="rounded-full"
                        style={{ display: isCollapsed ? 'none' : 'block' }} // Hide image when collapsed
                      />
                    ) : ''}
                    <div>
                      <Text fz="md" fw={500} className='font-medieval'>
                        {unit.name}
                        {!isCollapsed && unit.bonus > 0 && <span className='text-xs font-medieval'> (+{toLocale(unit.bonus)} {heading === 'Economy' ? 'Gold/t' : heading})</span>}
                      </Text>
                      {!isCollapsed && (
                        <>
                          <Text fz="xs" c='dimmed'>Cost: {toLocale(unit.cost, user?.locale)} Gold</Text>
                          <Text fz="xs" c='dimmed'>Sale: {toLocale(Math.floor(Number(String(unit.cost).replace(/,/g, '')) * 0.75), user?.locale)}</Text>
                        </>
                      )}
                    </div>
                  </Group>
                </Table.Td>
                {/* Owned Units */}
                <Table.Td style={{ width: '30%' }}>
                  <Text fz="sm" fw={500}>
                    <span className='font-medieval'>Owned: </span>
                    <span id={`${unit.id}_owned`}>{toLocale(unit.ownedUnits || 0, user?.locale)}</span>
                  </Text>
                </Table.Td>
                {/* Input */}
                <Table.Td style={{ width: '30%' }}>
                  <NumberInput
                    aria-label={`Quantity for ${unit.name}`} // Better accessibility
                    name={unit.id}
                    value={unitCosts[unit.id] || 0}
                    onChange={(value) => handleInputChange(unit.id, value)}
                    min={0}
                    step={1}
                    allowNegative={false}
                    size='sm'
                  />
                </Table.Td>
              </Table.Tr>
            );
          } else {
            // Render locked units
            return (
              <Table.Tr key={unit.id}>
                <Table.Td>
                  <Group gap={'sm'} align="flex-start" wrap="nowrap">
                    {/* No collapse toggle for locked, always show requirement */}
                    <Box style={{ paddingTop: '4px', width: '1.25em' }}></Box> {/* Spacer */}
                    <div>
                      <Text fz="md" fw={500} className='font-medieval' c="dimmed">
                        {unit.name}
                        {unit.bonus > 0 && <span className='text-xs font-medieval'> (+{toLocale(unit.bonus)} {heading === 'Economy' ? 'Gold/t' : heading})</span>}
                      </Text>
                      <Text fz="xs" c='dimmed'>Requires: {unit.requirement}</Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td colSpan={2}></Table.Td>{/* Empty cells */}
              </Table.Tr>
            );
          }
        })}
      </Table.Tbody>
    </Table>

    {/* Conversion Section - Only show if more than one unit type exists and at least one is owned */}
    {getUnits.length > 1 && availableFromUnits.length > 0 && (
      <Box mt="md" p="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-8)' }}>
        <Group gap="xs" grow align='flex-end' preventGrowOverflow={false}>
          <Text size="sm" fw={500} style={{ flexBasis: 'auto', flexGrow: 0 }}>Convert:</Text>
          <NumberInput size="xs"
            value={conversionAmount}
            onChange={(value) => setConversionAmount(Number(value) || 0)}
            min={0}
            step={100}
            allowNegative={false}
            style={{ flexBasis: '100px', flexGrow: 1 }}
          />
          <Select size="xs"
            data={availableFromUnits}
            value={fromUnitId}
            onChange={setFromUnitId}
            placeholder="Owned Unit"
            searchable clearable
            style={{ flexBasis: '150px', flexGrow: 2 }}
          />
          <Select size="xs"
            data={availableToUnits}
            value={toUnitId}
            onChange={setToUnitId}
            placeholder="Target Unit"
            searchable clearable
            disabled={!fromUnitId}
            style={{ flexBasis: '150px', flexGrow: 2 }}
          />
          <Stack gap={0} style={{ flexBasis: '120px', flexGrow: 1, textAlign: 'right' }}>
            <Text size='xs'>{toLower ? 'Refund:' : 'Cost:'}</Text>
            <Text size='sm' fw={500}>{toLocale(toLower ? Math.floor(conversionCost) : Math.ceil(conversionCost), user?.locale)}</Text>
          </Stack>
          <Tooltip label={convertError || (!fromUnitId || !toUnitId ? 'Select units' : conversionAmount <= 0 ? 'Enter quantity' : !toLower && BigInt(Math.ceil(conversionCost)) > userGold ? 'Not enough gold' : '')} disabled={!(!fromUnitId || !toUnitId || conversionAmount <= 0 || (!toLower && BigInt(Math.ceil(conversionCost)) > userGold)) || isProcessingConvert} withArrow>
             <div style={{ width: 'auto' }}> {/* Wrapper for disabled tooltip */}
                <Button
                  onClick={handleConvert}
                  disabled={!fromUnitId || !toUnitId || conversionAmount <= 0 || (!toLower && BigInt(Math.ceil(conversionCost)) > userGold) || isProcessingTrain || isProcessingUntrain || isProcessingConvert}
                  loading={isProcessingConvert}
                  size="xs"
                  variant='outline'
                  style={{ flexBasis: 'auto', flexGrow: 0 }}
                >
                  Convert
                </Button>
             </div>
          </Tooltip>
        </Group>
        {/* Inline Error Display for Convert */}
        {convertError && (
            <Text color="red" size="xs" ta="center" mt="xs">
                {convertError}
            </Text>
        )}
      </Box>
    )}
  </ContentCard>
);
}

export default NewUnitSection;