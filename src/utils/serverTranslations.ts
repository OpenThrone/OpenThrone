import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { serverSideTranslations as loadTranslations } from 'next-i18next/serverSideTranslations';

import { localeResources } from '@/lib/localeResources';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextI18NextConfig = require('../../next-i18next.config');

/**
 * Keep development page resources fresh even when i18next reuses its server instance.
 *
 * The inline config is always passed to next-i18next as an explicit override:
 * without it, next-i18next fs-reads `next-i18next.config.js` from the process
 * cwd on every server render, which crashes on runtimes without a readable
 * project root (e.g. Cloudflare Workers). The bundled `resources` additionally
 * preload every locale/namespace into the server instance so next-i18next's
 * fs-backend is registered but never actually reads public/locales — which is
 * impossible on Workers. `serializeConfig: false` keeps those resources out of
 * the page props: the client initializes from the inline config that _app
 * passes to appWithTranslation and lazy-loads namespaces over HTTP from
 * /locales, which the Workers asset serving already answers.
 */
const serverI18nConfig = {
  ...nextI18NextConfig,
  resources: localeResources,
  serializeConfig: false,
};

export async function serverSideTranslations(
  ...args: Parameters<typeof loadTranslations>
): Promise<Awaited<ReturnType<typeof loadTranslations>>> {
  const [locale, namespaces, configOverride, ...extraArgs] = args;
  const result = await loadTranslations(
    locale,
    namespaces,
    configOverride ?? serverI18nConfig,
    ...extraArgs,
  );
  if (process.env.NODE_ENV === 'production') return result;

  const store = result._nextI18Next.initialI18nStore;
  await Promise.all(
    Object.entries(store).flatMap(([storeLocale, storeNamespaces]) =>
      Object.keys(storeNamespaces).map(async (namespace) => {
        const file = path.join(
          process.cwd(),
          'public',
          'locales',
          storeLocale,
          `${namespace}.json`,
        );
        storeNamespaces[namespace] = JSON.parse(await readFile(file, 'utf8'));
      }),
    ),
  );
  return result;
}
