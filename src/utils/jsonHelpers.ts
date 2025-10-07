/**
 * BigInt-aware JSON.stringify replacer: converts BigInt to string with 'n' suffix for roundtrip safety.
 */
const bigIntReplacer = (key: string, value: any): any => {
  if (typeof value === 'bigint') {
    return value.toString() + 'n';
  }
  return value;
};

/**
 * BigInt-aware JSON.parse reviver: converts strings ending in 'n' back to BigInt.
 */
const bigIntReviver = (key: string, value: any): any => {
  if (typeof value === 'string' && /^-?\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  return value;
};

/**
 * Safely stringifies an object, handling BigInts with replacer.
 * @param obj - The object to stringify.
 * @returns JSON string with BigInts as 'numbern' strings.
 */
export const safeStringify = (obj: any): string => {
  return JSON.stringify(obj, bigIntReplacer);
};

/**
 * Safely parses a JSON string, handling BigInt strings with reviver.
 * @param json - The JSON string.
 * @returns Parsed object with 'numbern' strings as BigInts.
 */
export const safeParse = (json: string): any => {
  return JSON.parse(json, bigIntReviver);
};

/**
 * Recursively converts BigInts in an object to strings with 'n' suffix (for use before JSON.stringify).
 * Enhances existing stringifyObj for roundtrip.
 * @param obj - The object to process.
 * @returns Modified object with BigInts as strings.
 */
export const stringifyObj = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (typeof obj === 'bigint') {
    return obj.toString() + 'n';
  }
  const result: any = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = stringifyObj(obj[key]);
    }
  }
  return result;
};