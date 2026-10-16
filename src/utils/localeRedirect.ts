/**
 * Locale prefix for server-side redirect destinations.
 *
 * Next.js i18n routing serves the default locale unprefixed, so a redirect
 * built without the prefix silently drops `/de` / `/es` back to English.
 * Pair with `GetServerSidePropsContext`'s `locale` / `defaultLocale`:
 *
 *   destination: `${localePrefix(locale, defaultLocale)}/structures/bank/deposit`,
 */
export const localePrefix = (
  locale?: string | null,
  defaultLocale?: string | null,
): string => {
  if (!locale || !defaultLocale || locale === defaultLocale) return '';
  return `/${locale}`;
};
