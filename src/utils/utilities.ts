import { UnitTypes } from '@/constants';
import type { UnitType } from '@/types/typings';

const getUnitName = (type: UnitType, level: number): string => {
  const unit = UnitTypes.find((u) => u.type === type && u.level === level);
  return unit ? unit.name : 'Unknown';
};

const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const generateRandomString = (length) => {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export { formatDate, getUnitName, generateRandomString };
