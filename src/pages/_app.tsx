import 'tailwindcss/tailwind.css';
import '@/styles/global.css';
import '@opendominion/rpg-awesome/css/rpg-awesome.min.css';
import '@fortawesome/fontawesome-svg-core/styles.css';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/tiptap/styles.css';
import '@mantine/notifications/styles.css';

import { config } from '@fortawesome/fontawesome-svg-core';
import { MantineProvider } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { SessionProvider } from 'next-auth/react';
import { appWithTranslation, useTranslation } from 'next-i18next';
import React, { Suspense, useEffect, useMemo, useState } from 'react';

import Layout from '@/components/Layout';
import LoadingDots from '@/components/loading-dots';
import RuntimeMaintenanceBoundary from '@/components/RuntimeMaintenanceBoundary';
import SnackbarBridge from '@/components/SnackbarBridge';
import { LayoutProvider } from '@/context/LayoutContext';
import { SnackbarProvider } from '@/context/snackbar-context';
import { UserProvider, useUser } from '@/context/users';
import { useArtworkPreview } from '@/hooks/useArtworkPreview';
import { cssVariablesResolver, themes } from '@/styles/themes';
import type { PlayerRace } from '@/types/typings';

config.autoAddCss = false;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextI18NextConfig = require('../../next-i18next.config');

const MyApp = ({ Component, pageProps: { session, ...pageProps } }) => (
  <Suspense fallback={<LoadingDots />}>
    <SessionProvider
      session={session}
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      <SnackbarProvider>
        <UserProvider>
          <SnackbarBridge />
          <AppWithTheme Component={Component} pageProps={pageProps} />
        </UserProvider>
      </SnackbarProvider>
    </SessionProvider>
  </Suspense>
);

const namespaceMatchers: Array<{
  matches: (path: string) => boolean;
  namespaces: string[];
}> = [
  { matches: (path) => path === '/', namespaces: ['landing'] },
  { matches: (path) => path === '/faq', namespaces: ['faq'] },
  { matches: (path) => path.startsWith('/account'), namespaces: ['account'] },
  { matches: (path) => path.startsWith('/home'), namespaces: ['home'] },
  {
    matches: (path) => path.startsWith('/home/admin'),
    namespaces: [
      'admin-system',
      'admin-game',
      'admin-activity',
      'admin-signals',
      'admin-operations',
      'admin-abuse',
    ],
  },
  {
    matches: (path) => path.startsWith('/home/moderation'),
    namespaces: ['moderation-admin', 'admin-abuse'],
  },
  {
    matches: (path) => path.startsWith('/battle'),
    namespaces: ['battle', 'messaging', 'allianceIntel'],
  },
  {
    matches: (path) => path.startsWith('/community'),
    namespaces: ['community'],
  },
  {
    matches: (path) => path.startsWith('/how-to-play'),
    namespaces: ['how-to-play'],
  },
  {
    matches: (path) => path.startsWith('/auto-recruit'),
    namespaces: ['community'],
  },
  { matches: (path) => path.startsWith('/social'), namespaces: ['social'] },
  {
    matches: (path) => path.startsWith('/structures'),
    namespaces: ['structures'],
  },
  {
    matches: (path) => path.startsWith('/alliances'),
    namespaces: ['alliances'],
  },
  {
    matches: (path) => path.startsWith('/messaging'),
    namespaces: ['messaging'],
  },
  {
    matches: (path) => path.startsWith('/administration'),
    namespaces: ['admin'],
  },
  { matches: (path) => path.startsWith('/socket-test'), namespaces: ['test'] },
];

const getNamespacesForPath = (path: string) => {
  const basePath = path.split('?')[0] || '/';
  const namespaces = new Set(['common', 'navigation', 'runtime-controls']);
  namespaceMatchers.forEach(({ matches, namespaces: entries }) => {
    if (matches(basePath)) {
      entries.forEach((entry) => namespaces.add(entry));
    }
  });
  return Array.from(namespaces);
};

type AppWithThemeProps = Pick<AppProps, 'Component' | 'pageProps'>;

export const AppWithTheme = ({ Component, pageProps }: AppWithThemeProps) => {
  const { i18n } = useTranslation('common');
  const router = useRouter();
  const pageKey = `${router.locale}:${router.pathname}`;
  const pageResources = pageProps._nextI18Next?.initialI18nStore;
  const [syncedPage, setSyncedPage] = useState({
    resources: pageResources,
    key: pageKey,
  });

  useEffect(() => {
    if (pageResources && i18n?.isInitialized) {
      for (const [locale, namespaces] of Object.entries(pageResources)) {
        for (const [namespace, messages] of Object.entries(
          namespaces as Record<string, object>,
        )) {
          i18n.addResourceBundle(locale, namespace, messages, true, true);
        }
      }
    }
    setSyncedPage((previous) =>
      previous.resources === pageResources && previous.key === pageKey
        ? previous
        : { resources: pageResources, key: pageKey },
    );
  }, [i18n, pageResources, pageKey]);
  const artworkPreview = useArtworkPreview();
  const { user } = useUser();
  const [colorScheme, setColorScheme] = useLocalStorage<PlayerRace | string>({
    key: 'colorScheme',
    defaultValue: 'ELF',
  });
  const [previewScheme] = useLocalStorage<PlayerRace | ''>({
    key: 'colorSchemePreview',
    defaultValue: '',
  });

  useEffect(() => {
    if (user?.colorScheme && user.colorScheme !== colorScheme)
      setColorScheme(user.colorScheme);
  }, [user?.colorScheme, colorScheme, setColorScheme]);

  const theme = useMemo(() => {
    const isPreviewPage =
      router.pathname === '/test' || router.pathname === '/home/settings';
    const activeScheme =
      (isPreviewPage && previewScheme) || user?.colorScheme || colorScheme;
    return themes[activeScheme] ?? themes.ELF;
  }, [router.pathname, previewScheme, user?.colorScheme, colorScheme]);

  useEffect(() => {
    if (!router.isReady || !i18n?.loadNamespaces) {
      return;
    }
    const namespaces = getNamespacesForPath(router.asPath || router.pathname);
    i18n.loadNamespaces(namespaces);
  }, [router.isReady, router.asPath, router.pathname, i18n, i18n?.language]);

  useEffect(() => {
    if (!i18n?.loadNamespaces) {
      return undefined;
    }
    const handleRouteChangeStart = (url: string) => {
      const namespaces = getNamespacesForPath(url);
      i18n.loadNamespaces(namespaces);
    };
    router.events.on('routeChangeStart', handleRouteChangeStart);
    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart);
    };
  }, [router.events, i18n]);

  return (
    <MantineProvider
      defaultColorScheme="dark"
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
    >
      <Notifications position="top-right" />
      <LayoutProvider key={artworkPreview}>
        <Layout>
          {pageResources === syncedPage.resources ||
          pageKey === syncedPage.key ? (
            <RuntimeMaintenanceBoundary>
              <Component {...pageProps} />
            </RuntimeMaintenanceBoundary>
          ) : (
            <LoadingDots />
          )}
        </Layout>
      </LayoutProvider>
    </MantineProvider>
  );
};

// Client-side translation loading: namespaces are loaded on-demand via i18next-http-backend
// SEO-critical namespaces should be loaded via serverSideTranslations in individual pages
export default appWithTranslation(MyApp, nextI18NextConfig);
