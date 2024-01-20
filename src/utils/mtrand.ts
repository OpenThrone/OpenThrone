/**
 * Generates a random number between the given minimum and maximum values (inclusive).
 * @param min The minimum value of the range.
 * @param max The maximum value of the range.
 * @returns A random number between the given minimum and maximum values (inclusive).
 */
const mtRand = (min: number, max: number): number => {
  return min + Math.random() * (max - min);
}

export default mtRand;