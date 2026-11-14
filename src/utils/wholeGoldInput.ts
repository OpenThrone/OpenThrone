/**
 * Reads a Mantine NumberInput change as whole gold, keeping an emptied field
 * empty. Snapping '' back to 0 left the caret in front of the "0", so typing
 * 5000 after clearing the field produced 50,000.
 */
export const wholeGoldInput = (value: string | number): number | '' => {
  if (value === '') return '';
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The amount a whole-gold field stands for; empty counts as 0. */
export const wholeGoldValue = (value: number | ''): number =>
  value === '' ? 0 : value;

/**
 * Digit grouping for a whole-gold NumberInput in the page language, so a typed
 * amount reads like the text around it: 50,000 in English, 50.000 in German
 * and Spanish. The decimal separator only has to differ from the grouping one.
 */
export const wholeGoldSeparators = (
  locale?: string,
): { thousandSeparator: string; decimalSeparator: string } => {
  let group = ',';
  try {
    group =
      new Intl.NumberFormat(locale || undefined)
        .formatToParts(1_000_000)
        .find((part) => part.type === 'group')?.value ?? ',';
  } catch {
    group = ',';
  }
  return {
    thousandSeparator: group,
    decimalSeparator: group === ',' ? '.' : ',',
  };
};
