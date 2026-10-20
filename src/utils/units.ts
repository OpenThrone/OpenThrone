// utils/units.ts

import { UnitTypes } from '@/constants';
import { applyEventDiscount } from '@/constants/gameEvents';
import type UserModel from '@/models/Users';
import type { PlayerUnit } from '@/types/typings';

/** A unit's price after the player's price bonus, as the Training page shows it. */
export const getDiscountedUnitPrice = (cost: number, priceBonus: number) =>
  Math.max(0, cost - Math.ceil((priceBonus / 100) * cost));

/** Looks up a unit definition by type and level. Returns undefined for unknown units. */
export const findUnitDefinition = (type: string, level: number) =>
  UnitTypes.find((u) => u.type === type && u.level === level);

/**
 * Calculates total cost used by combat, economy, or presentation logic.
 * @throws Error when any unit type/level is not defined in UnitTypes (never returns 0 for unknown input).
 */
export const calculateTotalCost = (
  units: PlayerUnit[],
  uModel: UserModel,
  eventDiscountPercent = 0,
): number => {
  let totalCost = 0;
  units.forEach((unitData) => {
    const unitType = findUnitDefinition(unitData.type, unitData.level);
    if (!unitType) {
      throw new Error(
        `Invalid unit definition: ${unitData.type}_${unitData.level}`,
      );
    }
    if (eventDiscountPercent > 0) {
      // Same per-unit price the Training page shows during a discount event.
      totalCost +=
        applyEventDiscount(
          getDiscountedUnitPrice(unitType.cost, uModel.priceBonus || 0),
          eventDiscountPercent,
        ) * unitData.quantity;
      return;
    }
    totalCost +=
      (unitType.cost - ((uModel.priceBonus || 0) / 100) * unitType.cost) *
      unitData.quantity;
  });
  return Math.ceil(totalCost); // Always return an integer
};

/** Update units map. */
export const updateUnitsMap = (
  unitsMap: Map<string, PlayerUnit>,
  units: PlayerUnit[],
  isTraining: boolean,
  citizensRequired: number = 0,
): Map<string, PlayerUnit> => {
  const citizenUnitKey = 'CITIZEN_1';
  const citizenUnit = unitsMap.get(citizenUnitKey);

  if (isTraining) {
    if (!citizenUnit || citizenUnit.quantity < citizensRequired) {
      throw new Error('Not enough citizens to train units');
    }
    citizenUnit.quantity -= citizensRequired;
  } else if (citizenUnit) {
    citizenUnit.quantity += citizensRequired;
  } else if (citizensRequired > 0) {
    // Zero-citizen inventories may omit the row entirely. Returning population
    // must create it rather than silently discarding the untrained units.
    unitsMap.set(citizenUnitKey, {
      id: 0,
      userId: units[0]?.userId ?? 0,
      type: 'CITIZEN',
      level: 1,
      quantity: citizensRequired,
      isMercenary: false,
    });
  }

  units.forEach((unitData) => {
    const unitKey = `${unitData.type}_${unitData.level}`;
    const currentUnit = unitsMap.get(unitKey);

    if (currentUnit) {
      if (!isTraining) {
        if (currentUnit.quantity < unitData.quantity) {
          throw new Error(
            `Cannot untrain more units than available for ${unitData.type} level ${unitData.level}`,
          );
        }
      }
      currentUnit.quantity += isTraining
        ? unitData.quantity
        : -unitData.quantity;

      // Ensure quantity does not drop below zero
      if (currentUnit.quantity < 0) {
        throw new Error(
          `Quantity cannot be negative for ${unitData.type} level ${unitData.level}`,
        );
      }
    } else if (isTraining) {
      // When adding a new unit entry, ensure we create a full PlayerUnit shape
      unitsMap.set(unitKey, {
        id: 0,
        userId: 0,
        type: unitData.type,
        level: unitData.level,
        quantity: unitData.quantity,
        isMercenary: false,
      } as PlayerUnit);
    } else {
      // We don't need to throw an error for this
    }
  });

  return unitsMap;
};
