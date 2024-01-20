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

export { formatDate, getUnitName };
