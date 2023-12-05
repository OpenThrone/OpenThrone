import { Locales } from "@/types/typings";

const toLocale = (num: number | string, locale?: Locales) => {
  if (typeof num === 'number') {
    return num.toLocaleString(locale || undefined);
  } else if (typeof num === 'string') {
    // Parse string back to number for formatting
    const parsed = parseInt(num.replace(/,/g, ''), 10);
    console.log('parsed: ', parsed);
    return isNaN(parsed) ? "0" : parsed.toLocaleString(locale || undefined);
  }
  return "0";
}


export default toLocale;