/**
 * Safely resolves locale from Next.js context with fallback chain.
 * Priority: context.locale -> context.defaultLocale -> 'en'
 *
 * @param context - Next.js getServerSideProps context
 * @returns Safe locale string (always defined)
 */
export const getSafeLocale = (context: any): string => {
  return context?.locale ?? context?.defaultLocale ?? 'en';
};
