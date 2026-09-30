const path = require('path');

const isBrowser = typeof window !== 'undefined';
const HttpBackend = isBrowser ? require('i18next-http-backend').default : null;

module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'de'],
  },
  // Hybrid approach: server uses ./public/locales, client loads from /locales via HTTP
  localePath: isBrowser ? '/locales' : path.resolve('./public/locales'),
  use: HttpBackend ? [HttpBackend] : [],
  serializeConfig: false,
  // Required for hybrid http-backend setups: trust preloaded namespaces instead
  // of round-tripping through the backend (which causes hydration raw-key flashes).
  partialBundledLanguages: true,
  // Required to prevent client from rendering raw keys before i18n resolves.
  // Suspended render is caught by <Suspense fallback={<LoadingDots />}> in _app.tsx.
  react: {
    useSuspense: true,
    hashV1: true,
  },
  reloadOnPrerender: process.env.NODE_ENV === 'development',
  // Enable lazy loading for client-side translations
  ...(isBrowser && {
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
      addPath: '/locales/{{lng}}/{{ns}}.json',
    },
  }),
};
