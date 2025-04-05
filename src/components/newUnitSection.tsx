import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { NumberInput, Group, Text, Table, Select, Button, Space, Box, Stack, Flex } from '@mantine/core';
import toLocale from '@/utils/numberFormatting';
import { alertService } from '@/services';
import { useUser } from '@/context/users';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQuestionCircle, faCoins, faShieldHalved, faUserSecret, faEye, faHammer, faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import ContentCard from './ContentCard';
import RpgAwesomeIcon from './RpgAwesomeIcon';
import { logError } from '@/utils/logger';
import { UnitType, UnitProps } from '@/types/typings';

const formatHeading = (secHeading: string): string => {
  return secHeading
    .split(' ')
    .map((word) =>
      word.length > 0 ? word[0].toUpperCase() + word.substring(1).toLowerCase() : ''
    )
    .join(' ');
};

// Helper to get an icon based on section heading/type
const getSectionIcon = (heading: string) => {
  const lowerHeading = heading.toLowerCase();
  if (lowerHeading.includes('economy') || lowerHeading.includes('worker')) {
    return <FontAwesomeIcon icon={faCoins} />;
  }
  if (lowerHeading.includes('offense')) {
    return <RpgAwesomeIcon icon="crossed-swords" />; // Example using RpgAwesome
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

type NewUnitSectionProps = {
  heading: string;
  units: UnitProps[];
  updateTotalCost: (sectionType: UnitType, cost: number) => void;
  unitCosts: { [key: string]: number };
  setUnitCosts: React.Dispatch<React.SetStateAction<{ [key: string]: number }>>;
  unitType: UnitType;
};

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

  // Callback for input changes
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
    updateTotalCost(unitType, sectionCost); // Pass unitType as the key

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

  }, [units, unitCosts, setUnitCosts, updateTotalCost, unitType]); // Dependencies


  // Handle section-specific Train API call
  const handleTrainSection = useCallback(async () => {
    if (!user) {
      alertService.error('User not found.');
      return;
    }
    const unitsToTrain = units
      .map(unit => ({
        ...unit,
        quantity: unitCosts[unit.id] || 0,
      }))
      .filter(unit => unit.quantity > 0 && unit.enabled);

    if (unitsToTrain.length === 0) {
      alertService.warn(`No ${heading} units selected to train.`);
      return;
    }

    const currentSectionCost = unitsToTrain.reduce((acc, unit) => {
      const unitCostValue = Number(String(unit.cost).replace(/,/g, '')) || 0;
      return acc + (unit.quantity * unitCostValue);
    }, 0);


    if (currentSectionCost > (Number(user.gold) ?? 0)) {
      alertService.error(`Insufficient gold for this section. Needs ${toLocale(currentSectionCost, user.locale)}, have ${toLocale(user.gold ?? 0, user.locale)}.`);
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
      resetSectionCosts(); // Reset costs for this section
      forceUpdate(); // Update user context
    } catch (error: any) {
      logError(`Error training ${heading} units`, error);
      alertService.error(error.message || `Failed to train ${heading} units.`);
    }
  }, [user, units, unitCosts, unitType, heading, resetSectionCosts, forceUpdate]);

  // Handle section-specific Untrain API call
  const handleUntrainSection = useCallback(async () => {
     if (!user) {
      alertService.error('User not found.');
      return;
    }
    const unitsToUntrain = units
      .map(unit => ({
        ...unit,
        quantity: unitCosts[unit.id] || 0,
      }))
      .filter(unit => unit.quantity > 0 && unit.enabled);

    if (unitsToUntrain.length === 0) {
      alertService.warn(`No ${heading} units selected to untrain.`);
      return;
    }

    // Check if user owns enough of each unit *in this section*
    for (const unit of unitsToUntrain) {
        const owned = unit.ownedUnits || 0;
        if (unit.quantity > owned) {
            alertService.error(`Cannot untrain ${toLocale(unit.quantity, user.locale)} ${unit.name}(s), you only own ${toLocale(owned, user.locale)}.`);
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
      resetSectionCosts(); // Reset costs for this section
      forceUpdate(); // Update user context
    } catch (error: any) {
      logError(`Error untraining ${heading} units`, error);
      alertService.error(error.message || `Failed to untrain ${heading} units.`);
    }
  }, [user, units, unitCosts, unitType, heading, resetSectionCosts, forceUpdate]);


  // Get memoized list of units (no filtering needed here as collapsing handles visibility)
  const getUnits = useMemo(() => {
    // Sort units by level for consistent display order
    return [...units].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  }, [units]);

  // Reset conversion form
  const resetConversion = useCallback(() => {
    setConversionAmount(0);
    setFromUnitId(null);
    setToUnitId(null);
    setConversionCost(0);
    setToLower(false);
  }, []);

  // Handle conversion API call
  const handleConvert = useCallback(async () => {
    if (!fromUnitId || !toUnitId || !conversionAmount || conversionAmount <= 0) {
      alertService.error('Please select units and provide a valid quantity > 0 to convert.');
      return;
    }
    if (!user) {
      alertService.error('User not found.');
      return;
    }

    const fromUnitData = getUnits.find((item) => item.id === fromUnitId);
    if (!fromUnitData) {
      alertService.error('Invalid "from" unit selected for conversion.');
      return;
    }
    if ((fromUnitData.ownedUnits || 0) < conversionAmount) {
      alertService.error(`You only own ${toLocale(fromUnitData.ownedUnits || 0, user.locale)} ${fromUnitData.name}(s). Cannot convert ${toLocale(conversionAmount, user.locale)}.`);
      return;
    }

    // Check gold only if converting to a *higher* level unit
    if (!toLower && conversionCost > (Number(user.gold) ?? 0)) {
      alertService.error(`Insufficient gold. Conversion costs ${toLocale(conversionCost, user.locale)}, but you only have ${toLocale(user.gold ?? 0, user.locale)}.`);
      return;
    }


    try {
      const response = await fetch('/api/training/convert', { // Use training API endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          fromUnitId: fromUnitId, // Send IDs
          toUnitId: toUnitId,     // Send IDs
          quantity: conversionAmount, // Use 'quantity' field matching typical APIs
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
      logError('Failed to convert units', error);
      alertService.error(error.message || 'Failed to convert units. Please try again.');
    }
  }, [user, fromUnitId, toUnitId, conversionAmount, conversionCost, toLower, getUnits, resetConversion, forceUpdate]);

  // Toggle collapse state
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

// Define footer content similar to NewItemSection
const footerContent = (
  <Flex justify='space-between' align="center" p="xs">
    <Stack gap="xs">
      <Text size='sm'>Section Cost: {toLocale(sectionTotalCost, user?.locale)}</Text>
      <Text size='sm' c="dimmed">Section Refund: {toLocale(Math.floor(sectionTotalCost * 0.75), user?.locale)}</Text>
    </Stack>
    <Group gap="sm">
      <Button
        color='green'
        onClick={handleTrainSection}
        disabled={sectionTotalCost <= 0 || sectionTotalCost > (Number(user?.gold) ?? 0)}
        size="xs" // Match convert button size
      >
        Train Section
      </Button>
      <Button
        color='red'
        onClick={handleUntrainSection}
        disabled={sectionTotalCost <= 0}
        size="xs" // Match convert button size
      >
        Untrain Section
      </Button>
    </Group>
  </Flex>
);

return (
  <ContentCard
    title={formatHeading(heading)}
    icon={getSectionIcon(heading)}
    iconPosition="title-left" // Match Armory style
    className="my-6" // Adjust margin as needed
    footer={footerContent} // *** ADDED FOOTER PROP ***
  >
    <Table striped highlightOnHover verticalSpacing="sm">
      {/* Removed Thead for cleaner look matching ItemSection */}
      <Table.Tbody>
        {getUnits.map((unit) => {
          const isCollapsed = collapsedItems[unit.id] ?? false;
          // Determine if this is the *first* disabled unit to show its requirement
          // This logic is simplified compared to the original, focusing on enabled/disabled state
          // const isFirstDisabled = !unit.enabled && getUnits.findIndex(u => !u.enabled) === index;

          if (unit.enabled) {
            return (
              <Table.Tr key={unit.id}>
                {/* Unit Name, Bonus, Cost */}
                <Table.Td style={{ width: '40%' }}>
                  <Group gap={'sm'} align="flex-start" wrap="nowrap">
                    <Box onClick={() => toggleCollapse(unit.id)} style={{ cursor: 'pointer', paddingTop: '4px' }} aria-expanded={!isCollapsed} role="button">
                      {isCollapsed ? <FontAwesomeIcon icon={faPlus} size="sm" /> : <FontAwesomeIcon icon={faMinus} size="sm" />}
                    </Box>
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
                    step={100} // Optional: Add step for easier large inputs
                    allowNegative={false}
                    size='sm'
                  />
                </Table.Td>
              </Table.Tr>
            );
          } else {
            // Render locked units (only if not collapsed)
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
            <Text size='sm' fw={500}>{toLocale(conversionCost, user?.locale)}</Text>
          </Stack>
          <Button
            onClick={handleConvert}
            disabled={!fromUnitId || !toUnitId || conversionAmount <= 0}
            size="xs"
            variant='outline'
            style={{ flexBasis: 'auto', flexGrow: 0 }}
          >
            Convert
          </Button>
        </Group>
      </Box>
    )}
  </ContentCard>
);
}

// Memoization (Optional but potentially useful if props don't change often)
// const MemoizedNewUnitSection = React.memo(NewUnitSection);
// export default MemoizedNewUnitSection;

export default NewUnitSection; // Export non-memoized version for now