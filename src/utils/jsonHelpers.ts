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
  // Ensure primitive BigInt inputs and nested BigInts are converted by running
  // the recursive helper first, then stringify with the replacer as a fallback.
  try {
    const preprocessed = stringifyObj(obj);
    return JSON.stringify(preprocessed, bigIntReplacer);
  } catch (e) {
    // If something unexpected happens, fall back to direct JSON.stringify with replacer.
    return JSON.stringify(obj, bigIntReplacer);
  }
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
  // If the value itself is a bigint primitive, convert and return immediately.
  if (typeof obj === 'bigint') {
    return obj.toString() + 'n';
  }

  // Primitives (including null, number, string, boolean, undefined) are returned as-is.
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // For arrays, map each element through stringifyObj. For plain objects, recurse over own properties.
  if (Array.isArray(obj)) {
    return obj.map((v) => stringifyObj(v));
  }

  const result: any = {};
  for (const key of Object.keys(obj)) {
    result[key] = stringifyObj((obj as any)[key]);
  }
  return result;
};

/**
 * Parse a value into a bigint if possible.
 * Accepts bigint, integer numbers, strings like "123n" or "1,234".
 * Returns bigint on success, or null on failure.
 */
export const parseBigInt = (v: any): bigint | null => {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
  if (typeof v === 'string') {
    const cleaned = v.replace(/,/g, '').trim();
    const withoutSuffix = cleaned.endsWith('n') ? cleaned.slice(0, -1) : cleaned;
    try {
      return BigInt(withoutSuffix);
    } catch (e) {
      return null;
    }
  }
  return null;
};