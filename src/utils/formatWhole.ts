import type { Locales } from '@/types/typings';

/**
 * Whole numbers (gold, counts) written in full for the page language, e.g.
 * 2,000,000,000 or 2.000.000.000. Unlike toLocale it never abbreviates, so a
 * value reads the same on every alliance screen.
 */
export const formatWhole = (
  value: number | bigint | string | null | undefined,
  locale?: Locales | string,
): string => {
  if (value === null || value === undefined || value === '') return '0';
  try {
    const whole =
      typeof value === 'bigint'
        ? value
        : typeof value === 'string'
          ? BigInt(value.replace(/[,n]/g, '').split('.')[0] || '0')
          : Math.trunc(value);
    return whole.toLocaleString(locale || undefined);
  } catch {
    return '0';
  }
};
