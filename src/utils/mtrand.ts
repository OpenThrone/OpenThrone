/**
 * Generates a random number between the given minimum and maximum values (inclusive).
 * @param min The minimum value of the range.
 * @param max The maximum value of the range.
 * @returns A random number between the given minimum and maximum values (inclusive).
 */
export const mtRand = (
  min: number,
  max: number,
  random: () => number = Math.random,
): number => {
  return min + random() * (max - min);
};
