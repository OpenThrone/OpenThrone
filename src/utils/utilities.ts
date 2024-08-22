import { levelXPArray, UnitTypes } from '@/constants';
import type { UnitType } from '@/types/typings';

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
const getAssetPath = (name, size, race) => {
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
    case 'Elf-wall-header':
      path += '/header/Elf-wall-header.webp';
      break;
    case 'OpenThrone':
      path += '/header/OpenThrone.webp';
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

export { formatDate, getUnitName, generateRandomString, getLevelFromXP, getAssetPath, getAvatarSrc, calculateOverallRank };
