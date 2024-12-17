// utils/units.ts

import { UnitTypes } from '@/constants';
import UserModel from '@/models/Users';
import { PlayerUnit, UnitType } from '@/types/typings';

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
  isTraining: boolean,
  citizensRequired: number = 0
): Map<string, PlayerUnit> => {
  const citizenUnitKey = 'CITIZEN_1';
  const citizenUnit = unitsMap.get(citizenUnitKey);

  if (isTraining) {
    if (!citizenUnit || citizenUnit.quantity < citizensRequired) {
      throw new Error('Not enough citizens to train units');
    }
    citizenUnit.quantity -= citizensRequired;
  } else {
    if (citizenUnit) {
      citizenUnit.quantity += citizensRequired;
    }
  }

  units.forEach(unitData => {
    const unitKey = `${unitData.type}_${unitData.level}`;
    const currentUnit = unitsMap.get(unitKey);

    if (currentUnit) {
      if (!isTraining) {
        if (currentUnit.quantity < unitData.quantity) {
          throw new Error(`Cannot untrain more units than available for ${unitData.type} level ${unitData.level}`);
        }
      }
      currentUnit.quantity += isTraining ? unitData.quantity : -unitData.quantity;

      // Ensure quantity does not drop below zero
      if (currentUnit.quantity < 0) {
        throw new Error(`Quantity cannot be negative for ${unitData.type} level ${unitData.level}`);
      }
    } else if (isTraining) {
      unitsMap.set(unitKey, { ...unitData });
    } else {
      return; // We don't need to throw an error for this
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

export const getAverageLevelAndHP = (units: PlayerUnit[], unitType: UnitType, level: number | string = "all") => {
  const filteredUnits = units.filter((unit) => unit.type === unitType && unit.quantity > 0 && (Number.isInteger(level)?unit.level ===level:true));
  console.log('filteredUnits', filteredUnits)
  let totalLevel = 0;
  let totalHP = 0;
  let totalQuantity = 0;
  for (const unit of filteredUnits) {
    const unitHP = unit.level * 50; // Assuming base HP is 50 per level
    totalLevel += unit.level * unit.quantity;
    totalHP += unitHP * unit.quantity;
    totalQuantity += unit.quantity;
  }
  if (totalQuantity === 0) return { averageLevel: 0, averageHP: 0 };
  return {
    averageLevel: Math.ceil(totalLevel / totalQuantity),
    averageHP: Math.ceil(totalHP / totalQuantity),
  };
}
