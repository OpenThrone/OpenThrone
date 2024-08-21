// utils/units.ts

import { UnitTypes } from '@/constants';
import UserModel from '@/models/Users';
import { PlayerUnit } from '@/types/typings';

export const calculateTotalCost = (units: PlayerUnit[], uModel: UserModel): number => {
  let totalCost = 0;
  units.forEach(unitData => {
    const unitType = UnitTypes.find(u => u.type === unitData.type && u.level === unitData.level);
    if (unitType) {
      totalCost += (unitType.cost - ((uModel.priceBonus || 0) / 100) * unitType.cost) * unitData.quantity;
    }
  });
  return totalCost;
};

export const updateUnitsMap = (
  unitsMap: Map<string, PlayerUnit>,
  units: PlayerUnit[],
  isTraining: boolean
): Map<string, PlayerUnit> => {
  units.forEach(unitData => {
    const unitKey = `${unitData.type}_${unitData.level}`;
    const currentUnit = unitsMap.get(unitKey);
    if (currentUnit) {
      currentUnit.quantity += isTraining ? unitData.quantity : -unitData.quantity;
    } else if (isTraining) {
      unitsMap.set(unitKey, { ...unitData });
    }
  });
  return unitsMap;
};

export const validateUnits = (units: PlayerUnit[]): boolean => {
  return units.every(unitData => {
    const unitType = UnitTypes.find(u => u.type === unitData.type && u.level === unitData.level);
    return unitType && unitData.quantity >= 0;
  });
};
