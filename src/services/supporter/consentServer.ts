import de from '../../../public/locales/de/supporter.json';
import en from '../../../public/locales/en/supporter.json';
import es from '../../../public/locales/es/supporter.json';

type Dict = Record<string, unknown>;
const dictionaries: Record<string, Dict> = { en, es, de };

export const consentLocale = (locale: unknown) => {
  const base = typeof locale === 'string' ? locale.slice(0, 2) : 'en';
  return base in dictionaries ? base : 'en';
};

/** Server-side translator over the supporter namespace, for consent text. */
export function supporterTranslator(locale: string) {
  const find = (dict: Dict, key: string) =>
    key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Dict | undefined)?.[part],
        dict,
      );
  return (key: string, vars: Record<string, string | number> = {}) =>
    String(
      find(dictionaries[locale] ?? en, key) ?? find(en, key) ?? key,
    ).replace(/{{(\w+)}}/g, (_, name: string) => String(vars[name] ?? ''));
}
