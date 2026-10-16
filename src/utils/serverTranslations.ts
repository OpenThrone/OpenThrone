import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { serverSideTranslations as loadTranslations } from 'next-i18next/serverSideTranslations';

/** Keep development page resources fresh even when i18next reuses its server instance. */
export async function serverSideTranslations(
  ...args: Parameters<typeof loadTranslations>
): Promise<Awaited<ReturnType<typeof loadTranslations>>> {
  const result = await loadTranslations(...args);
  if (process.env.NODE_ENV === 'production') return result;

  const store = result._nextI18Next.initialI18nStore;
  await Promise.all(
    Object.entries(store).flatMap(([locale, namespaces]) =>
      Object.keys(namespaces).map(async (namespace) => {
        const file = path.join(
          process.cwd(),
          'public',
          'locales',
          locale,
          `${namespace}.json`,
        );
        namespaces[namespace] = JSON.parse(await readFile(file, 'utf8'));
      }),
    ),
  );
  return result;
}
