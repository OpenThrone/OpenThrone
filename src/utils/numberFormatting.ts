import type { Locales } from '@/types/typings';
import { stringifyObj as stringifyBigInts } from '@/utils/jsonHelpers';

/** Formats numeric values using the current locale-friendly grouping style. */
export const toLocale = (num: number | string | bigint, locale?: Locales) => {
  if (typeof num === 'number') {
    return num.toLocaleString(locale || undefined);
  }
  if (typeof num === 'string') {
    let parsedBigInt;
    try {
      parsedBigInt = BigInt(num.replace(/,/g, ''));
      if (num.length > 10) return convertToHumanReadable(parsedBigInt, locale);
      if (parsedBigInt <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(parsedBigInt).toLocaleString(locale || undefined);
      }
    } catch {
      // Not a valid BigInt, attempt Number parsing
    }

    const parsedNum = parseInt(num.replace(/,/g, ''), 10);
    return isNaN(parsedNum)
      ? '0'
      : parsedNum.toLocaleString(locale || undefined);
  }
  if (typeof num === 'bigint') {
    // Adjust here for BigInt handling
    return convertToHumanReadable(num, locale);
  }
  return '0';
};

const _fromLocale = (str: string, locale?: Locales) => {
  const localeSeparators = {
    'en-US': { decimal: '.', thousands: ',' },
    'es-ES': { decimal: ',', thousands: '.' },
  };

  // Get the separators for the specified locale or default to 'en-US'
  const { decimal, thousands } = localeSeparators[locale || 'en-US'];

  // Remove thousands separators
  const normalizedStr = str.replace(new RegExp(`\\${thousands}`, 'g'), '');

  // Replace the decimal separator with a period
  const cleanedStr = normalizedStr.replace(decimal, '.');

  // Attempt to convert to BigInt or Number
  try {
    return BigInt(cleanedStr);
  } catch {
    return parseFloat(cleanedStr);
  }
};

const convertToHumanReadable = (num: bigint, locale?: Locales) => {
  const names = [
    { value: 1e9, name: 'Billion' },
    { value: 1e12, name: 'Trillion' },
    { value: 1e15, name: 'Quadrillion' },
    { value: 1e18, name: 'Quintillion' },
    { value: 1e21, name: 'Sextillion' },
    { value: 1e24, name: 'Septillion' },
    { value: 1e27, name: 'Octillion' },
  ];

  for (let i = names.length - 1; i >= 0; i--) {
    const { value, name } = names[i];
    if (num >= BigInt(value)) {
      const result = Number(num / BigInt(value)).toLocaleString(
        locale || undefined,
        { minimumFractionDigits: 3, maximumFractionDigits: 3 },
      );
      return `${result} ${name}`;
    }
  }
  // Fallback for numbers less than 1 million
  return Number(num).toLocaleString(locale || undefined);
};

// Re-export the canonical bigint-aware stringify function from jsonHelpers.
export const stringifyObj = stringifyBigInts;

const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
