import { Locales } from "@/types/typings";



export const toLocale = (num: number | string | bigint, locale?: Locales) => {
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
  console.log('convertToHuman: ', num)
  const billion = 1000000000n;
  const trillion = 1000000000000n;

  if (num < billion) {
    // Convert BigInt to Number for toLocaleString() because it's safe here
    return Number(num).toLocaleString(locale || undefined);
  } else if (num >= billion && num < trillion) {
    const result = (Number(num) / 1e9).toLocaleString(locale || undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return `${result} Billion`;
  } else {
    const result = (Number(num) / 1e12).toLocaleString(locale || undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return `${result} Trillion`;
  }
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