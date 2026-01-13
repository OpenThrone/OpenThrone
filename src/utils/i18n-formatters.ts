/**
 * i18n Formatting Utilities
 * Provides locale-aware formatting for numbers, dates, and currency
 */

export const formatNumber = (
  value: number,
  locale: string = 'en',
  options?: Intl.NumberFormatOptions
): string => {
  return new Intl.NumberFormat(locale, options).format(value);
};

export const formatCurrency = (
  value: number,
  locale: string = 'en',
  currency: string = 'USD'
): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
};

export const formatGold = (
  value: number,
  locale: string = 'en'
): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatCompactNumber = (
  value: number,
  locale: string = 'en'
): string => {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
};

export const formatDate = (
  date: Date | string,
  locale: string = 'en',
  options?: Intl.DateTimeFormatOptions
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, options).format(dateObj);
};

export const formatTime = (
  date: Date | string,
  locale: string = 'en'
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(dateObj);
};

export const formatRelativeTime = (
  date: Date | string,
  locale: string = 'en'
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const absDiff = Math.abs(diffInSeconds);

  if (absDiff < 60) {
    return rtf.format(-Math.floor(diffInSeconds / 1), 'second');
  } else if (absDiff < 3600) {
    return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
  } else if (absDiff < 86400) {
    return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
  } else if (absDiff < 2592000) {
    return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
  } else if (absDiff < 31536000) {
    return rtf.format(-Math.floor(diffInSeconds / 2592000), 'week');
  } else if (absDiff < 3153600000) {
    return rtf.format(-Math.floor(diffInSeconds / 31536000), 'month');
  } else {
    return rtf.format(-Math.floor(diffInSeconds / 315360000), 'year');
  }
};

export const formatShortDate = (
  date: Date | string,
  locale: string = 'en'
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
};

export const formatLongDate = (
  date: Date | string,
  locale: string = 'en'
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dateObj);
};

export const formatDateTime = (
  date: Date | string,
  locale: string = 'en'
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(dateObj);
};

export const formatPercentage = (
  value: number,
  locale: string = 'en',
  maximumFractionDigits: number = 0
): string => {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits,
  }).format(value);
};

export const getNumberSeparator = (locale: string = 'en'): { decimal: string; group: string } => {
  const format = new Intl.NumberFormat(locale);
  const parts = format.formatToParts(1000.1);
  const decimal = parts.find((part) => part.type === 'decimal')?.value || '.';
  const group = parts.find((part) => part.type === 'group')?.value || ',';
  return { decimal, group };
};

export const formatPlural = (
  count: number,
  singular: string,
  plural: string,
  locale: string = 'en'
): string => {
  return count === 1 ? singular : plural;
};

export const formatDuration = (
  seconds: number,
  locale: string = 'en'
): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  } else if (minutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${minutes}m`;
  }
};
