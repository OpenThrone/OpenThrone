import { levelXPArray, UnitTypes } from '@/constants';
import UserModel from '@/models/Users';
import type { PlayerRace, UnitType } from '@/types/typings';
import { newCalculateStrength } from './attackFunctions';
import { createHash, webcrypto } from 'crypto';

/**
   * Returns the name of a unit based on its type and level.
   * @param type - The type of the unit.
   * @param level - The level of the unit.
   * @returns The name of the unit.
   */
const getUnitName = (type: UnitType, level: number): string => {
  const unit = UnitTypes.find((u) => u.type === type && u.level === level);
  return unit ? unit.name : 'Unknown';
};

/**
   * Formats a timestamp into a human-readable date and time string.
   * @param timestamp - The timestamp to format.
   * @returns The formatted date and time string.
   */
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

/**
   * Generates a random string of a given length.
   * @param length - The length of the random string.
   * @returns The random string.
   */
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

/**
 * Returns the path for a requested asset, using AWS S3 if configured.
 * @param {string} name The name of the asset
 * @param {string} [size] The size of the asset, if applicable (example: '150x150')
 * @param {string} [race] The race associated with the asset, if applicable
 * @returns {string} The path for the specified asset, fit for use in HTML tags
 */
const getAssetPath = (name, size?, race: PlayerRace = 'ELF') => {
  let path = '';
  if (process.env.NEXT_PUBLIC_USE_AWS) {
    path += process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT + '/images';
  } else {
    path += '/assets';
  }

  switch (name) {
    case 'shields':
      path += '/shields/' +
        (race || 'ELF') + // TODO: Saner fallback/default
        '_' + size + '.webp';
      break;
    case 'advisor-scroll':
      if (!process.env.NEXT_PUBLIC_USE_AWS) {
        path += '/images/';
      }
      path += 'advisor-scroll.webp';
      break;
    case 'wall-header':
      path += `/header/${race}-wall-header.webp`;
      break;
    case 'top-menu':
      path += `/header/${race}_nav_top.png`;
      break;
    case 'bottom-menu':
      path += `/header/${race}_nav_bottom.png`;
      break;
    case 'OpenThrone':
      path += '/header/OpenThrone.webp';
      break;
    case 'corner-double-border':
      path += '/background/ELF_top_left_double_border.svg';
      break;
    case 'double-border':
      path += '/background/ELF_top_double_border.svg';
      break;
    default:
  }

  return path;
};

/*
  * Returns the source for the avatar image.
  * @param avatar - The avatar string
  * @param race (optional) - the race of the user
  * @returns The source for the avatar image.
*/
const getAvatarSrc = (avatar: string, race?: string) => {
  if(avatar.startsWith('http')) {
    return avatar;
  }
  if (avatar === 'SHIELD') {
    if (race) {
      return getAssetPath('shields', '25x25', race);
    }
  }
}

const calculateOverallRank = (user) => {
  const unitScore = user.units
    ? user.units.map((unit) => unit.quantity).reduce((a, b) => a + b, 0)
    : 0;
  const itemScore = user.items
    ? user.items.map((item) => item.quantity * (item.level * 0.1)).reduce((a, b) => a + b, 0)
    : 0;

  return 0.7 * user.experience +
    0.2 * user.fort_level +
    0.1 * user.house_level +
    0.004 * unitScore +
    0.003 * itemScore;
};

const calculateUserStats = (userData: any, updatedData: any[], type: 'units' | 'items' | 'battle_upgrades') => {
  const newUserData = { ...userData };
  if (type === 'units') {
    newUserData.units = updatedData;
  } else if (type === 'items') {
    newUserData.items = updatedData;
  } else if (type === 'battle_upgrades') {
    newUserData.battle_upgrades = updatedData;
  }

  const newUModel = new UserModel(newUserData);
  const { killingStrength, defenseStrength } = newCalculateStrength(newUModel, 'OFFENSE');

  return {
    killingStrength,
    defenseStrength,
    newOffense: newUModel.getArmyStat('OFFENSE'),
    newDefense: newUModel.getArmyStat('DEFENSE'),
    newSpying: newUModel.getArmyStat('SPY'),
    newSentry: newUModel.getArmyStat('SENTRY'),
  };
};

const serializeDates = (obj) => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      if (value instanceof Date) {
        return [key, value.toISOString()];
      } else if (typeof value === 'object' && value !== null) {
        return [key, serializeDates(value)]; // Recursively handle nested objects
      }
      return [key, value];
    })
  );
}

export const idleThresholdDate = (days = 60) => { //60days is default
  const now = new Date();
  // if last_active is more than 60 days, set account status to IDLE
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Ensures the result is at least 0.
 * @param {number} value - The input number to check.
 * @returns {number} - The input value if it's 0 or greater, otherwise 0.
 */
export const atLeastZero = (value: number):number => {
  return Math.max(0, value);
}

export const getSHA256Key = (secret: string) => {
  return createHash("sha256").update(secret).digest();
}

export async function importKey(rawKey: Buffer) {
  return await webcrypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

export { formatDate, getUnitName, generateRandomString, getLevelFromXP, getAssetPath, getAvatarSrc, calculateOverallRank, calculateUserStats, serializeDates };
