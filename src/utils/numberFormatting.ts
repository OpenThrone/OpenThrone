import { Locales } from "@/types/typings";



export const toLocale = (num: number | string | bigint| BigInt, locale?: Locales) => {
  if (typeof num === 'number') {
    return num.toLocaleString(locale || undefined);
  } else if (typeof num === 'string') {
    let parsedBigInt;
    try {
      parsedBigInt = BigInt(num.replace(/,/g, ''));
      if(num.length > 10) return convertToHumanReadable(parsedBigInt, locale);
      if (parsedBigInt <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(parsedBigInt).toLocaleString(locale || undefined);
      }
    } catch (e) {
      // Not a valid BigInt, attempt Number parsing
    }

    const parsedNum = parseInt(num.replace(/,/g, ''), 10);
    return isNaN(parsedNum) ? "0" : parsedNum.toLocaleString(locale || undefined);
  } else if (typeof num === 'bigint') {
    // Adjust here for BigInt handling
    return convertToHumanReadable(num, locale);
  }
  return "0";
};

const convertToHumanReadable = (num: bigint, locale?: Locales) => {
  const names = [
    { value: 1e9, name: "Billion" },
    { value: 1e12, name: "Trillion" },
    { value: 1e15, name: "Quadrillion" },
    { value: 1e18, name: "Quintillion" },
    { value: 1e21, name: "Sextillion" },
    { value: 1e24, name: "Septillion" },
    { value: 1e27, name: "Octillion" },
  ];

  for (let i = names.length - 1; i >= 0; i--) {
    const { value, name } = names[i];
    if (num >= BigInt(value)) {
      const result = Number(num / BigInt(value)).toLocaleString(locale || undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
      return `${result} ${name}`;
    }
  }
  // Fallback for numbers less than 1 million
  return Number(num).toLocaleString(locale || undefined);
};

export const stringifyObj = (obj) => {
  for (let key in obj) {
    if (typeof obj[key] === 'bigint') {
      obj[key] = obj[key].toString();
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      stringifyObj(obj[key]);
    }
  }
  return obj;
};


export default toLocale;