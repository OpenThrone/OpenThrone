import {
  faMinus,
  faPlus,
  faQuestionCircle,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Box,
  Button,
  Flex,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { UnitProps, UnitType } from '@/types/typings';
import { logError } from '@/utils/logger';
import toLocale from '@/utils/numberFormatting';

import { GameCard } from './game/GameCard';
import ImageWithFallback from './ImagWithFallback';

/**
 * Formats a section heading string to title case.
 * @param secHeading - The raw heading string (e.g., "OFFENSE UNITS").
 * @returns The formatted heading string (e.g., "Offense Units").
 */
const formatHeading = (secHeading: string): string => {
  return secHeading
    .split(' ')
    .map((word) =>
      word.length > 0
        ? word[0].toUpperCase() + word.substring(1).toLowerCase()
        : '',
    )
    .join(' ');
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
  const theme = useMantineTheme();
  const [conversionAmount, setConversionAmount] = useState<number>(0);
  const [fromUnitId, setFromUnitId] = useState<string | null>(null);
  const [toUnitId, setToUnitId] = useState<string | null>(null);
  const [conversionCost, setConversionCost] = useState(0);
  const [toLower, setToLower] = useState(false);
  const [collapsedItems, setCollapsedItems] = useState<Record<string, boolean>>(
    {},
  );
  const [trainUntrainError, setTrainUntrainError] = useState<string | null>(
    null,
  ); // State for train/untrain errors
  const [convertError, setConvertError] = useState<string | null>(null); // State for convert errors
  const [isProcessingTrain, setIsProcessingTrain] = useState(false); // Loading state for train
  const [isProcessingUntrain, setIsProcessingUntrain] = useState(false); // Loading state for untrain
  const [isProcessingConvert, setIsProcessingConvert] = useState(false); // Loading state for convert

  // Effect to calculate conversion cost
  useEffect(() => {
    if (!fromUnitId || !toUnitId || !units) {
      setConversionCost(0);
      return;
    }
    const fromUnitData = units.find((item) => item.id === fromUnitId);
    const toUnitData = units.find((item) => item.id === toUnitId);

    if (
      !fromUnitData ||
      !toUnitData ||
      fromUnitData.level === undefined ||
      toUnitData.level === undefined
    ) {
      setConversionCost(0);
      return;
    }

    const isLower = fromUnitData.level > toUnitData.level;
    setToLower(isLower);

    const fromCostNum =
      Number(String(fromUnitData.cost).replace(/,/g, '')) || 0;
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
  const handleInputChange = useCallback(
    (unitId: string, value: number | string | undefined) => {
      const numericValue =
        value === undefined || value === '' || isNaN(Number(value))
          ? 0
          : Math.max(0, Number(value));
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
        logError(
          `[NewUnitSection] Calculated sectionCost is NaN for section ${unitType}. Resetting to 0.`,
        );
        sectionCost = 0; // Prevent passing NaN up
      }
      updateTotalCost(unitType, sectionCost);
    },
    [unitCosts, setUnitCosts, units, updateTotalCost, unitType],
  );

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
    const sectionUnitIds = units.map((u) => u.id);
    const newCosts = { ...unitCosts };
    let didReset = false;

    sectionUnitIds.forEach((id) => {
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
      .map((unit) => ({
        ...unit,
        quantity: unitCosts[unit.id] || 0,
      }))
      .filter((unit) => unit.quantity > 0 && unit.enabled);

    if (unitsToTrain.length === 0) {
      setTrainUntrainError(`No ${heading} units selected to train.`);
      setIsProcessingTrain(false);
      return;
    }

    const currentSectionCost = unitsToTrain.reduce((acc, unit) => {
      const unitCostValue = Number(String(unit.cost).replace(/,/g, '')) || 0;
      return acc + Math.ceil(unit.quantity * unitCostValue);
    }, 0);

    const userGold = BigInt(user.gold?.toString() ?? '0');
    if (BigInt(currentSectionCost) > userGold) {
      setTrainUntrainError(
        `Insufficient gold. Needs ${toLocale(currentSectionCost, user.locale)}.`,
      );
      setIsProcessingTrain(false);
      return;
    }

    // Check citizens
    const citizensRequired = unitsToTrain.reduce(
      (acc, unit) => acc + unit.quantity,
      0,
    );
    const availableCitizens =
      user.units?.find((u) => u.type === 'CITIZEN' && u.level === 1)
        ?.quantity ?? 0;
    if (citizensRequired > availableCitizens) {
      setTrainUntrainError(
        `Insufficient citizens. Needs ${toLocale(citizensRequired, user.locale)}, have ${toLocale(availableCitizens, user.locale)}.`,
      );
      setIsProcessingTrain(false);
      return;
    }

    const apiPayload = unitsToTrain.map((unit) => ({
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
      alertService.success(
        data.message || `${heading} units trained successfully!`,
      );
      resetSectionCosts();
      forceUpdate();
    } catch (error: any) {
      logError(`Error training ${heading} units:`, error);
      setTrainUntrainError(
        error.message || `Failed to train ${heading} units.`,
      );
    } finally {
      setIsProcessingTrain(false);
    }
  }, [
    user,
    units,
    unitCosts,
    unitType,
    heading,
    resetSectionCosts,
    forceUpdate,
    isProcessingConvert,
    isProcessingTrain,
    isProcessingUntrain,
  ]);

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
      .map((unit) => ({
        ...unit,
        quantity: unitCosts[unit.id] || 0,
      }))
      .filter((unit) => unit.quantity > 0 && unit.enabled);

    if (unitsToUntrain.length === 0) {
      setTrainUntrainError(`No ${heading} units selected to untrain.`);
      setIsProcessingUntrain(false);
      return;
    }

    // Check if user owns enough of each unit *in this section*
    for (const unit of unitsToUntrain) {
      const owned = unit.ownedUnits || 0;
      if (unit.quantity > owned) {
        setTrainUntrainError(
          `Not enough ${unit.name} to untrain (Own: ${toLocale(owned, user.locale)}).`,
        );
        setIsProcessingUntrain(false);
        return;
      }
    }

    const apiPayload = unitsToUntrain.map((unit) => ({
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
      alertService.success(
        data.message || `${heading} units untrained successfully!`,
      );
      resetSectionCosts();
      forceUpdate();
    } catch (error: any) {
      logError(`Error untraining ${heading} units:`, error);
      setTrainUntrainError(
        error.message || `Failed to untrain ${heading} units.`,
      );
    } finally {
      setIsProcessingUntrain(false);
    }
  }, [
    user,
    units,
    unitCosts,
    unitType,
    heading,
    resetSectionCosts,
    forceUpdate,
    isProcessingConvert,
    isProcessingTrain,
    isProcessingUntrain,
  ]);

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

    if (
      !fromUnitId ||
      !toUnitId ||
      !conversionAmount ||
      conversionAmount <= 0
    ) {
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
      setConvertError(
        `Not enough ${fromUnitData.name} to convert (Own: ${toLocale(fromUnitData.ownedUnits || 0, user.locale)}).`,
      );
      setIsProcessingConvert(false);
      return;
    }

    const userGold = BigInt(user.gold?.toString() ?? '0');
    if (!toLower && BigInt(Math.ceil(conversionCost)) > userGold) {
      setConvertError(
        `Insufficient gold (Cost: ${toLocale(conversionCost, user.locale)}).`,
      );
      setIsProcessingConvert(false);
      return;
    }

    try {
      const response = await fetch('/api/training/convert', {
        // Use training API endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          fromUnit: fromUnitId, // API expects fromUnit
          toUnit: toUnitId, // API expects toUnit
          conversionAmount, // API expects conversionAmount
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
  }, [
    user,
    fromUnitId,
    toUnitId,
    conversionAmount,
    conversionCost,
    toLower,
    getUnits,
    resetConversion,
    forceUpdate,
    isProcessingConvert,
    isProcessingTrain,
    isProcessingUntrain,
  ]);

  // Filter units for conversion dropdowns
  const availableUnitsForConversion = useMemo(
    () =>
      getUnits
        .filter((unit) => unit.enabled)
        .map((unit) => ({ value: unit.id, label: unit.name })),
    [getUnits],
  );

  const availableFromUnits = useMemo(
    () =>
      getUnits
        .filter((unit) => unit.enabled && (unit.ownedUnits || 0) > 0)
        .map((unit) => ({ value: unit.id, label: unit.name })),
    [getUnits],
  );

  const availableToUnits = useMemo(
    () =>
      availableUnitsForConversion.filter((unit) => unit.value !== fromUnitId),
    [availableUnitsForConversion, fromUnitId],
  );

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
    const baseUnitName =
      unit.id.split('_')[0].charAt(0).toUpperCase() +
      unit.id.split('_')[0].slice(1).toLowerCase();

    // Convert race to proper case (e.g., "ELF" to "Elf")
    const raceProperCase = user.race
      ? user.race.charAt(0).toUpperCase() + user.race.slice(1).toLowerCase()
      : 'Human'; // Default to Human if race not specified

    return `${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/Characters/${raceProperCase}/L${unit.level}${baseUnitName}.webp`;
  };

  const userGold = BigInt(user?.gold?.toString() ?? '0');
  const trainDisabled =
    sectionTotalCost <= 0 ||
    BigInt(Math.ceil(sectionTotalCost)) > userGold ||
    isProcessingTrain ||
    isProcessingUntrain ||
    isProcessingConvert;
  // Add check for owned units for untrain if needed (currently done inside handler)
  const untrainDisabled =
    sectionTotalCost <= 0 ||
    isProcessingTrain ||
    isProcessingUntrain ||
    isProcessingConvert;

  const trainTooltip =
    sectionTotalCost <= 0
      ? 'Enter quantities to train.'
      : BigInt(Math.ceil(sectionTotalCost)) > userGold
        ? `Not enough gold (Cost: ${toLocale(sectionTotalCost, user?.locale)})`
        : '';
  const untrainTooltip =
    sectionTotalCost <= 0 ? 'Enter quantities to untrain.' : '';
  const accent = theme.colors.secondary?.[4] ?? '#e5c55a';
  const slotBorder = '#1f2b3b';
  const slotBg = '#0f141a';
  const slotInset = 'inset 0 3px 6px rgba(0,0,0,0.6)';
  const citizenCount =
    user?.units?.find((unit) => unit.type === 'CITIZEN')?.quantity ?? 0;

  const toggleCollapse = (unitId: string) => {
    setCollapsedItems((prevState) => ({
      ...prevState,
      [unitId]: !prevState[unitId],
    }));
  };

  const getMaxTrainable = (unit: UnitProps) => {
    const unitCost = Number(String(unit.cost).replace(/,/g, '')) || 0;
    if (!unit.enabled || unitCost <= 0) return 0;

    const totalQueuedAll = Object.values(unitCosts).reduce(
      (sum, qty) => sum + (Number(qty) || 0),
      0,
    );
    const currentQty = unitCosts[unit.id] || 0;
    const availableCitizens = Math.max(
      0,
      citizenCount - (totalQueuedAll - currentQty),
    );

    const currentUnitCostTotal = currentQty * unitCost;
    const remainingGold =
      BigInt(userGold) -
      BigInt(Math.max(0, sectionTotalCost - currentUnitCostTotal));
    const maxByGold =
      unitCost > 0 ? Number(remainingGold / BigInt(unitCost)) : 0;

    const maxTrainable = Math.max(0, Math.min(availableCitizens, maxByGold));
    return Number.isFinite(maxTrainable) ? maxTrainable : 0;
  };

  const footerContent =
    sectionTotalCost > 0 || trainUntrainError ? (
      <>
        {trainUntrainError && (
          <Text color="red" size="sm" ta="center" mb="xs">
            {trainUntrainError}
          </Text>
        )}
        <Flex justify="space-between" align="center" p="xs">
          <Stack gap="xs">
            <Text size="sm">
              Section Cost: {toLocale(sectionTotalCost, user?.locale)}
            </Text>
            <Text size="sm" c="dimmed">
              Section Refund:{' '}
              {toLocale(Math.floor(sectionTotalCost * 0.75), user?.locale)}
            </Text>
          </Stack>
          <Group gap="sm">
            <Tooltip
              label={trainTooltip}
              disabled={!trainDisabled || isProcessingTrain}
              withArrow
            >
              <div style={{ width: 'auto' }}>
                <Button
                  color="yellow"
                  onClick={handleTrainSection}
                  disabled={trainDisabled}
                  loading={isProcessingTrain}
                  size="xs"
                  style={{
                    background: `linear-gradient(180deg, ${accent} 0%, #b98f2f 100%)`,
                    color: '#000',
                    border: `1px solid ${accent}`,
                    boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                  }}
                >
                  Train Section
                </Button>
              </div>
            </Tooltip>
            <Tooltip
              label={untrainTooltip}
              disabled={!untrainDisabled || isProcessingUntrain}
              withArrow
            >
              <div style={{ width: 'auto' }}>
                <Button
                  color="gray"
                  onClick={handleUntrainSection}
                  disabled={untrainDisabled}
                  loading={isProcessingUntrain}
                  size="xs"
                  style={{
                    backgroundColor: '#1f2b3b',
                    borderColor: '#2f3e52',
                    color: '#e5e7eb',
                    boxShadow: '0 2px 0 #0f151c',
                  }}
                >
                  Untrain Section
                </Button>
              </div>
            </Tooltip>
          </Group>
        </Flex>
      </>
    ) : null;

  return (
    <GameCard title={formatHeading(heading)} goldAccent className="my-6">
      <Stack gap="sm" data-testid="unit-list">
        {getUnits.map((unit) => {
          const isCollapsed = collapsedItems[unit.id] ?? false;
          return (
            <Box
              key={unit.id}
              data-testid="unit-card"
              style={{
                backgroundColor: slotBg,
                borderRadius: '6px',
                border: `1px solid ${slotBorder}`,
                boxShadow: slotInset,
                padding: '12px',
                opacity: unit.enabled ? 1 : 0.6,
              }}
            >
              <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap="sm" align="center" wrap="nowrap">
                  <Box
                    onClick={() => toggleCollapse(unit.id)}
                    style={{
                      cursor: 'pointer',
                      width: 18,
                      textAlign: 'center',
                    }}
                    aria-expanded={!isCollapsed}
                    role="tab"
                    data-testid="tab-button"
                  >
                    {isCollapsed ? (
                      <FontAwesomeIcon icon={faPlus} size="sm" />
                    ) : (
                      <FontAwesomeIcon icon={faMinus} size="sm" />
                    )}
                  </Box>
                  <Box
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 4,
                      border: '1px solid #333',
                      background: '#0b1016',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {process.env.NEXT_PUBLIC_SHOW_AI_IMAGES ? (
                      <ImageWithFallback
                        fallbackSrc={`${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/Characters/default-character.webp`}
                        src={getCharacterImage(unit)}
                        alt={unit.name}
                        width={48}
                        height={48}
                      />
                    ) : (
                      <FontAwesomeIcon icon={faQuestionCircle} />
                    )}
                  </Box>
                  <Box>
                    <Text
                      fz="sm"
                      fw={700}
                      className="font-medieval"
                      c={unit.enabled ? 'gray.2' : 'dimmed'}
                      tt="uppercase"
                      style={{ letterSpacing: '0.5px' }}
                      data-testid="unit-name"
                    >
                      {unit.name}
                    </Text>
                    {!isCollapsed && (
                      <>
                        <Group gap="xs" mt={2} wrap="wrap">
                          <Text
                            size="xs"
                            c="dimmed"
                            tt="uppercase"
                            style={{ letterSpacing: '0.3em' }}
                          >
                            Level {unit.level}
                          </Text>
                          {unit.bonus > 0 && (
                            <Text size="xs" c="dimmed">
                              (+{toLocale(unit.bonus)}{' '}
                              {heading === 'Economy' ? 'Gold/t' : heading})
                            </Text>
                          )}
                        </Group>
                        {unit.enabled ? (
                          <Group gap="xs" mt={4} data-testid="unit-stats">
                            <Text size="xs" c="dimmed">
                              Cost:{' '}
                              <span
                                style={{ color: accent }}
                                data-testid="unit-cost"
                              >
                                {toLocale(unit.cost, user?.locale)}
                              </span>
                            </Text>
                            <Text size="xs" c="dimmed">
                              |
                            </Text>
                            <Text size="xs" c="dimmed">
                              Owned:{' '}
                              <span id={`${unit.id}_owned`}>
                                {toLocale(unit.ownedUnits || 0, user?.locale)}
                              </span>
                            </Text>
                            <Text size="xs" c="dimmed">
                              |
                            </Text>
                            <Text size="xs" c="dimmed">
                              Sale:{' '}
                              {toLocale(
                                Math.floor(
                                  Number(String(unit.cost).replace(/,/g, '')) *
                                    0.75,
                                ),
                                user?.locale,
                              )}
                            </Text>
                          </Group>
                        ) : (
                          <Text size="xs" c="dimmed" mt={4}>
                            Requires: {unit.requirement}
                          </Text>
                        )}
                      </>
                    )}
                  </Box>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  <NumberInput
                    aria-label={`Quantity for ${unit.name}`}
                    name={unit.id}
                    value={unitCosts[unit.id] || 0}
                    onChange={(value) => handleInputChange(unit.id, value)}
                    min={0}
                    step={1}
                    allowNegative={false}
                    size="sm"
                    disabled={!unit.enabled}
                    styles={{
                      input: {
                        backgroundColor: '#0b1016',
                        border: '1px solid #2f3e52',
                        color: accent,
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        width: '88px',
                        textAlign: 'center',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                      },
                    }}
                  />
                  <Button
                    size="xs"
                    variant="default"
                    disabled={!unit.enabled}
                    onClick={() =>
                      handleInputChange(unit.id, getMaxTrainable(unit))
                    }
                    data-testid="train-button"
                    aria-label={`Set max ${unit.name}`}
                    role="button"
                    style={{
                      backgroundImage:
                        'linear-gradient(180deg, #2b3747 0%, #1f2b3b 100%)',
                      borderColor: '#2f3e52',
                      color: '#9ca3af',
                      minWidth: '48px',
                      minHeight: '48px',
                      boxShadow: '0 2px 0 #0f151c',
                    }}
                  >
                    MAX
                  </Button>
                </Group>
              </Group>
            </Box>
          );
        })}
      </Stack>

      {/* Conversion Section - Only show if more than one unit type exists and at least one is owned */}
      {getUnits.length > 1 &&
        availableFromUnits.length > 0 &&
        availableToUnits.length > 0 && (
          <Box mt="md" p="sm" style={{ borderTop: '1px solid #2f3e52' }}>
            <Group justify="space-between" mb="xs">
              <Text
                size="xs"
                fw={700}
                c="dimmed"
                tt="uppercase"
                style={{ letterSpacing: '0.3em' }}
              >
                Convert Units
              </Text>
              <Text size="xs" c="dimmed">
                {toLower ? 'Refund' : 'Cost'}:{' '}
                <span style={{ color: accent }}>
                  {toLocale(
                    toLower
                      ? Math.floor(conversionCost)
                      : Math.ceil(conversionCost),
                    user?.locale,
                  )}
                </span>
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm">
              <NumberInput
                size="sm"
                value={conversionAmount}
                onChange={(value) => setConversionAmount(Number(value) || 0)}
                min={0}
                step={100}
                allowNegative={false}
                label="Amount"
              />
              <Select
                size="sm"
                data={availableFromUnits}
                value={fromUnitId}
                onChange={setFromUnitId}
                label="Owned Unit"
                placeholder="Owned Unit"
                searchable
                clearable
              />
              <Select
                size="sm"
                data={availableToUnits}
                value={toUnitId}
                onChange={setToUnitId}
                label="Target Unit"
                placeholder="Target Unit"
                searchable
                clearable
                disabled={!fromUnitId}
              />
              <Tooltip
                label={
                  convertError ||
                  (!fromUnitId || !toUnitId
                    ? 'Select units'
                    : conversionAmount <= 0
                      ? 'Enter quantity'
                      : !toLower && BigInt(Math.ceil(conversionCost)) > userGold
                        ? 'Not enough gold'
                        : '')
                }
                disabled={
                  !(
                    !fromUnitId ||
                    !toUnitId ||
                    conversionAmount <= 0 ||
                    (!toLower && BigInt(Math.ceil(conversionCost)) > userGold)
                  ) || isProcessingConvert
                }
                withArrow
              >
                <div style={{ alignSelf: 'end' }}>
                  <Button
                    onClick={handleConvert}
                    disabled={
                      !fromUnitId ||
                      !toUnitId ||
                      conversionAmount <= 0 ||
                      (!toLower &&
                        BigInt(Math.ceil(conversionCost)) > userGold) ||
                      isProcessingTrain ||
                      isProcessingUntrain ||
                      isProcessingConvert
                    }
                    loading={isProcessingConvert}
                    size="sm"
                    color="yellow"
                    data-testid="action-button"
                    style={{
                      background: `linear-gradient(180deg, ${accent} 0%, #b98f2f 100%)`,
                      color: '#000',
                      border: `1px solid ${accent}`,
                      boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                      width: '100%',
                    }}
                  >
                    Convert
                  </Button>
                </div>
              </Tooltip>
            </SimpleGrid>
            {/* Inline Error Display for Convert */}
            {convertError && (
              <Text color="red" size="xs" ta="center" mt="xs">
                {convertError}
              </Text>
            )}
          </Box>
        )}
      <Box mt="md" pt="sm" style={{ borderTop: '1px solid #2f3e52' }}>
        {footerContent}
      </Box>
    </GameCard>
  );
};

export default NewUnitSection;
