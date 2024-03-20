import { levelXPArray, UnitTypes } from '@/constants';
import type { UnitType } from '@/types/typings';

const getUnitName = (type: UnitType, level: number): string => {
  const unit = UnitTypes.find((u) => u.type === type && u.level === level);
  return unit ? unit.name : 'Unknown';
};

const formatDate = (timestamp: string | number | Date) => {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const generateRandomString = (length: number) => {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

/**
   * Calculates the level of a user based on their XP using the levelXPArray.
   * @param xp - The amount of XP the user has.
   * @returns The user's level.
   */
const getLevelFromXP = (xp: number): number => {
  for (let i = 0; i < levelXPArray.length; i++) {
    if (xp < levelXPArray[i].xp) {
      return levelXPArray[i].level - 1 == 0 ? 1 : levelXPArray[i].level - 1;
    }
  }
  return levelXPArray[levelXPArray.length - 1].level; // Return max level if XP exceeds all defined levels
}

export { formatDate, getUnitName, generateRandomString, getLevelFromXP };
