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
  react: {
    useSuspense: false,
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
