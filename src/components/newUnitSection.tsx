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
  useMantineTheme,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import ImageWithFallback from '@/components/ArtworkImage';
import QuantityInput from '@/components/battle/QuantityInput';
import ConfirmationModal from '@/components/ConfirmationModal';
import { ActionTooltip } from '@/components/game/ActionTooltip';
import panelClasses from '@/components/game/Panels.module.css';
import { refundFromDiscountedCost } from '@/constants/gameEvents';
import { useUser } from '@/context/users';
import { useActiveGameEvents } from '@/hooks/useActiveGameEvents';
import { alertService } from '@/services/Alert.service';
import type { UnitProps, UnitType } from '@/types/typings';
import { getArtworkUrl, PURE_ARTWORK } from '@/utils/artwork';
import { logError } from '@/utils/logger';
import { toLocale } from '@/utils/numberFormatting';
import { getMaxTrainableQuantity } from '@/utils/trainingMax';
import {
  translateFortName,
  translateUnitName,
} from '@/utils/translateGameNames';

import { GameCard } from './game/GameCard';

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
  /** Gold queued across every section on the page; MAX leaves room for it. */
  pageTotalCost?: number;
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
  pageTotalCost,
}) => {
  const { user, forceUpdate } = useUser();
  const theme = useMantineTheme();
  const [conversionAmount, setConversionAmount] = useState<number>(0);
  const [fromUnitId, setFromUnitId] = useState<string | null>(null);
  const [toUnitId, setToUnitId] = useState<string | null>(null);
  const { t } = useTranslation('battle');
  const unitName = useCallback(
    (name: string) => translateUnitName(t, name),
    [t],
  );
  const fortName = useCallback(
    (name: string) => translateFortName(t, name),
    [t],
  );
  const [confirmUntrainOpen, setConfirmUntrainOpen] = useState(false);
  const {
    modifiers: { unitCostDiscountPercent: unitDiscount },
  } = useActiveGameEvents();
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

    // Conversions are never discounted by events, so preview at full price.
    const fromCostNum =
      fromUnitData.fullCost ??
      (Number(String(fromUnitData.cost).replace(/,/g, '')) || 0);
    const toCostNum =
      toUnitData.fullCost ??
      (Number(String(toUnitData.cost).replace(/,/g, '')) || 0);

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
      setTrainUntrainError(t('training.errors.userUnavailable'));
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
      setTrainUntrainError(
        t('training.errors.noneSelectedTrain', { section: heading }),
      );
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
        t('training.errors.insufficientGoldNeeds', {
          cost: toLocale(currentSectionCost, user.locale),
        }),
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
        t('training.insufficientCitizens', {
          needed: toLocale(citizensRequired, user.locale),
          have: toLocale(availableCitizens, user.locale),
        }),
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
        throw new Error(
          data?.error || t('training.errors.trainFailed', { section: heading }),
        );
      }
      alertService.success(
        data.message || t('training.success.trained', { section: heading }),
      );
      resetSectionCosts();
      forceUpdate();
    } catch (error: any) {
      logError(`Error training ${heading} units:`, error);
      setTrainUntrainError(
        error.message || t('training.errors.trainFailed', { section: heading }),
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
    t,
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
      setTrainUntrainError(t('training.errors.userUnavailable'));
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
      setTrainUntrainError(
        t('training.errors.noneSelectedUntrain', { section: heading }),
      );
      setIsProcessingUntrain(false);
      return;
    }

    // Check if user owns enough of each unit *in this section*
    for (const unit of unitsToUntrain) {
      const owned = unit.ownedUnits || 0;
      if (unit.quantity > owned) {
        setTrainUntrainError(
          t('training.errors.notEnoughToUntrain', {
            unit: unitName(unit.name),
            owned: toLocale(owned, user.locale),
          }),
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
        throw new Error(
          data?.error ||
            t('training.errors.untrainFailed', { section: heading }),
        );
      }
      alertService.success(
        data.message || t('training.success.untrained', { section: heading }),
      );
      resetSectionCosts();
      forceUpdate();
    } catch (error: any) {
      logError(`Error untraining ${heading} units:`, error);
      setTrainUntrainError(
        error.message ||
          t('training.errors.untrainFailed', { section: heading }),
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
    t,
    unitName,
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
      setConvertError(t('training.convert.selectAndQuantity'));
      setIsProcessingConvert(false);
      return;
    }
    if (!user) {
      setConvertError(t('training.errors.userUnavailable'));
      setIsProcessingConvert(false);
      return;
    }

    const fromUnitData = getUnits.find((item) => item.id === fromUnitId);
    if (!fromUnitData) {
      setConvertError(t('training.convert.invalidSource'));
      setIsProcessingConvert(false);
      return;
    }
    if ((fromUnitData.ownedUnits || 0) < conversionAmount) {
      setConvertError(
        t('training.convert.notEnoughToConvert', {
          unit: unitName(fromUnitData.name),
          owned: toLocale(fromUnitData.ownedUnits || 0, user.locale),
        }),
      );
      setIsProcessingConvert(false);
      return;
    }

    const userGold = BigInt(user.gold?.toString() ?? '0');
    if (!toLower && BigInt(Math.ceil(conversionCost)) > userGold) {
      setConvertError(
        t('training.convert.insufficientGold', {
          cost: toLocale(conversionCost, user.locale),
        }),
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
        throw new Error(data.error || t('training.convert.failed'));
      }

      alertService.success(data.message || t('training.convert.success'));
      resetConversion();
      forceUpdate(); // Update user context to reflect changes
    } catch (error: any) {
      logError('Failed to convert units:', error);
      setConvertError(error.message || t('training.convert.failedRetry'));
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
    t,
    unitName,
  ]);

  // Filter units for conversion dropdowns
  const availableUnitsForConversion = useMemo(
    () =>
      getUnits
        .filter((unit) => unit.enabled)
        .map((unit) => ({ value: unit.id, label: unitName(unit.name) })),
    [getUnits, unitName],
  );

  const availableFromUnits = useMemo(
    () =>
      getUnits
        .filter((unit) => unit.enabled && (unit.ownedUnits || 0) > 0)
        .map((unit) => ({ value: unit.id, label: unitName(unit.name) })),
    [getUnits, unitName],
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
      return (
        getArtworkUrl('images/Characters/default-character.webp') ??
        PURE_ARTWORK
      ); // Fallback image
    }

    // Get the base name from the unit ID (like "WORKER" from "WORKER_1")
    const baseUnitName =
      unit.id.split('_')[0].charAt(0).toUpperCase() +
      unit.id.split('_')[0].slice(1).toLowerCase();

    // Convert race to proper case (e.g., "ELF" to "Elf")
    const raceProperCase = user.race
      ? user.race.charAt(0).toUpperCase() + user.race.slice(1).toLowerCase()
      : 'Human'; // Default to Human if race not specified

    return (
      getArtworkUrl(
        `images/Characters/${raceProperCase}/L${unit.level}${baseUnitName}.webp`,
      ) ?? PURE_ARTWORK
    );
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
      ? t('training.section.enterTrainQuantities')
      : BigInt(Math.ceil(sectionTotalCost)) > userGold
        ? t('training.section.notEnoughGold', {
            cost: toLocale(sectionTotalCost, user?.locale),
          })
        : '';
  const untrainTooltip =
    sectionTotalCost <= 0 ? t('training.section.enterUntrainQuantities') : '';
  const accent = theme.colors.secondary?.[1] ?? '#e5c55a';
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
    // Gold queued anywhere on the page, not just this section (#88).
    const queuedGold = pageTotalCost ?? sectionTotalCost;
    return getMaxTrainableQuantity({
      citizens: citizenCount,
      citizensQueuedElsewhere: totalQueuedAll - currentQty,
      gold: BigInt(userGold),
      goldQueuedElsewhere: queuedGold - currentQty * unitCost,
      unitCost,
    });
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
              {t('training.section.cost', {
                amount: toLocale(sectionTotalCost, user?.locale),
              })}
            </Text>
            <Text size="sm" c="dimmed">
              {t('training.section.refund', {
                amount: toLocale(
                  refundFromDiscountedCost(sectionTotalCost, unitDiscount),
                  user?.locale,
                ),
              })}
            </Text>
          </Stack>
          <Group gap="sm">
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => {
                resetSectionCosts();
                setTrainUntrainError(null);
              }}
              disabled={
                sectionTotalCost <= 0 ||
                isProcessingTrain ||
                isProcessingUntrain
              }
              data-testid="clear-section-button"
            >
              {t('training.clearSection')}
            </Button>
            <ActionTooltip
              label={trainTooltip}
              disabled={!trainDisabled || isProcessingTrain}
            >
              <Button
                onClick={handleTrainSection}
                disabled={trainDisabled}
                loading={isProcessingTrain}
                size="xs"
              >
                {t('training.section.train')}
              </Button>
            </ActionTooltip>
            <ActionTooltip
              label={untrainTooltip}
              disabled={!untrainDisabled || isProcessingUntrain}
            >
              <Button
                variant="default"
                onClick={() => setConfirmUntrainOpen(true)}
                disabled={untrainDisabled}
                loading={isProcessingUntrain}
                size="xs"
              >
                {t('training.section.untrain')}
              </Button>
            </ActionTooltip>
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
              className={panelClasses.insetRow}
              data-disabled={unit.enabled ? undefined : true}
            >
              <Group justify="space-between" align="center">
                <Group gap="sm" align="center" wrap="nowrap">
                  <Box
                    onClick={() => toggleCollapse(unit.id)}
                    style={{
                      cursor: 'pointer',
                      width: 18,
                      textAlign: 'center',
                    }}
                    aria-expanded={!isCollapsed}
                    aria-label={
                      isCollapsed
                        ? t('training.unitCard.showDetails', {
                            unit: unitName(unit.name),
                          })
                        : t('training.unitCard.hideDetails', {
                            unit: unitName(unit.name),
                          })
                    }
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
                      border: '1px solid var(--ot-line)',
                      background: 'var(--ot-inset)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {process.env.NEXT_PUBLIC_SHOW_AI_IMAGES === 'true' ? (
                      <ImageWithFallback
                        fallback={<FontAwesomeIcon icon={faQuestionCircle} />}
                        src={getCharacterImage(unit)}
                        alt={unitName(unit.name)}
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
                      {unitName(unit.name)}
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
                            {t('training.unitCard.level', {
                              level: unit.level,
                            })}
                          </Text>
                          {unit.bonus > 0 && (
                            <Text size="xs" c="dimmed">
                              (+{toLocale(unit.bonus)}{' '}
                              {unitType === 'WORKER'
                                ? t('training.unitCard.goldPerTurn')
                                : heading}
                              )
                            </Text>
                          )}
                        </Group>
                        {unit.enabled ? (
                          <Group gap="xs" mt={4} data-testid="unit-stats">
                            <Text size="xs" c="dimmed">
                              {t('training.unitCard.cost')}{' '}
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
                              {t('training.unitCard.owned')}{' '}
                              <span id={`${unit.id}_owned`}>
                                {toLocale(unit.ownedUnits || 0, user?.locale)}
                              </span>
                            </Text>
                            <Text size="xs" c="dimmed">
                              |
                            </Text>
                            <Text size="xs" c="dimmed">
                              {t('training.unitCard.sale')}{' '}
                              {toLocale(
                                Math.floor(
                                  (unit.fullCost ??
                                    Number(
                                      String(unit.cost).replace(/,/g, ''),
                                    )) * 0.75,
                                ),
                                user?.locale,
                              )}
                            </Text>
                          </Group>
                        ) : (
                          <Text size="xs" c="dimmed" mt={4}>
                            {t('training.unitCard.requires', {
                              requirement: fortName(unit.requirement),
                            })}
                          </Text>
                        )}
                      </>
                    )}
                  </Box>
                </Group>
                <Group
                  gap="xs"
                  wrap="nowrap"
                  className="w-full justify-end sm:w-auto sm:justify-start"
                >
                  <QuantityInput
                    label={t('training.unitCard.quantityFor', {
                      unit: unitName(unit.name),
                    })}
                    hideLabel
                    name={unit.id}
                    value={unitCosts[unit.id] || 0}
                    onChange={(value) => handleInputChange(unit.id, value)}
                    disabled={!unit.enabled}
                    onMax={() =>
                      handleInputChange(unit.id, getMaxTrainable(unit))
                    }
                    maxAriaLabel={t('training.unitCard.setMax', {
                      unit: unitName(unit.name),
                    })}
                    maxTestId="train-button"
                  />
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
          <Box mt="md" p="sm" style={{ borderTop: '1px solid var(--ot-line)' }}>
            <Group justify="space-between" mb="xs">
              <Text
                size="xs"
                fw={700}
                c="dimmed"
                tt="uppercase"
                style={{ letterSpacing: '0.3em' }}
              >
                {t('training.convert.title')}
              </Text>
              <Text size="xs" c="dimmed">
                {toLower
                  ? t('training.convert.refund')
                  : t('training.convert.cost')}{' '}
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
                label={t('training.convert.amount')}
              />
              <Select
                size="sm"
                data={availableFromUnits}
                value={fromUnitId}
                onChange={setFromUnitId}
                label={t('training.convert.ownedUnit')}
                placeholder={t('training.convert.ownedUnit')}
                searchable
                clearable
              />
              <Select
                size="sm"
                data={availableToUnits}
                value={toUnitId}
                onChange={setToUnitId}
                label={t('training.convert.targetUnit')}
                placeholder={t('training.convert.targetUnit')}
                searchable
                clearable
                disabled={!fromUnitId}
              />
              <ActionTooltip
                label={
                  convertError ||
                  (!fromUnitId || !toUnitId
                    ? t('training.convert.selectUnits')
                    : conversionAmount <= 0
                      ? t('training.convert.enterQuantity')
                      : !toLower && BigInt(Math.ceil(conversionCost)) > userGold
                        ? t('training.convert.notEnoughGold')
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
                fullWidth
                wrapperStyle={{ alignSelf: 'end' }}
              >
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
                  fullWidth
                  data-testid="action-button"
                >
                  {t('training.convert.convert')}
                </Button>
              </ActionTooltip>
            </SimpleGrid>
            {/* Inline Error Display for Convert */}
            {convertError && (
              <Text color="red" size="xs" ta="center" mt="xs">
                {convertError}
              </Text>
            )}
          </Box>
        )}
      <Box mt="md" pt="sm" style={{ borderTop: '1px solid var(--ot-line)' }}>
        {footerContent}
      </Box>
      <ConfirmationModal
        isOpen={confirmUntrainOpen}
        onClose={() => setConfirmUntrainOpen(false)}
        onConfirm={() => {
          setConfirmUntrainOpen(false);
          handleUntrainSection();
        }}
        title={t('attack.untrainTitle')}
        message={t('attack.untrainMessage', {
          gold: toLocale(
            Math.max(
              0,
              Math.ceil(sectionTotalCost) -
                refundFromDiscountedCost(sectionTotalCost, unitDiscount),
            ),
            user?.locale,
          ),
        })}
        confirmText={t('attack.confirm')}
        cancelText={t('training.cancel')}
        type="destructive"
      />
    </GameCard>
  );
};

export default NewUnitSection;
