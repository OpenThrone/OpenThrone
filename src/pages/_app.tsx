import 'tailwindcss/tailwind.css';
import '@/styles/global.css';
import '@opendominion/rpg-awesome/css/rpg-awesome.min.css';
import '@fortawesome/fontawesome-svg-core/styles.css';
import '@mantine/core/styles.css';
import '@mantine/tiptap/styles.css';

import { config } from '@fortawesome/fontawesome-svg-core';
import { Center, Loader, MantineProvider } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { SessionProvider, useSession } from 'next-auth/react';
import { appWithTranslation, useTranslation } from 'next-i18next';
import React, { Suspense, useEffect, useState } from 'react';

import Layout from '@/components/Layout'; // Import the Layout component
import LoadingDots from '@/components/loading-dots';
import SnackbarBridge from '@/components/SnackbarBridge';
import { LayoutProvider } from '@/context/LayoutContext';
import { SnackbarProvider } from '@/context/snackbar-context';
import { UserProvider, useUser } from '@/context/users';
import { themes } from '@/styles/themes';
import type { PlayerRace } from '@/types/typings';

config.autoAddCss = false;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextI18NextConfig = require('../../next-i18next.config');

const MyApp = ({ Component, pageProps: { session, ...pageProps }, router }) => (
  <Suspense fallback={<LoadingDots />}>
    <SessionProvider session={session}>
      <SnackbarProvider>
        <UserProvider>
          <SnackbarBridge />
          <AppWithTheme
            Component={Component}
            pageProps={pageProps}
            router={router}
          />
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
  { matches: (path) => path.startsWith('/account'), namespaces: ['account'] },
  { matches: (path) => path.startsWith('/home'), namespaces: ['home'] },
  { matches: (path) => path.startsWith('/battle'), namespaces: ['battle'] },
  {
    matches: (path) => path.startsWith('/community'),
    namespaces: ['community'],
  },
  { matches: (path) => path.startsWith('/auto-recruit'), namespaces: ['community'] },
  { matches: (path) => path.startsWith('/social'), namespaces: ['social'] },
  {
    matches: (path) => path.startsWith('/structures'),
    namespaces: ['structures'],
  },
  {
    matches: (path) => path.startsWith('/alliances'),
    namespaces: ['alliances'],
  },
  { matches: (path) => path.startsWith('/messaging'), namespaces: ['messaging'] },
  {
    matches: (path) => path.startsWith('/administration'),
    namespaces: ['admin'],
  },
  { matches: (path) => path.startsWith('/socket-test'), namespaces: ['test'] },
];

const getNamespacesForPath = (path: string) => {
  const basePath = path.split('?')[0] || '/';
  const namespaces = new Set(['common']);
  namespaceMatchers.forEach(({ matches, namespaces: entries }) => {
    if (matches(basePath)) {
      entries.forEach((entry) => namespaces.add(entry));
    }
  });
  return Array.from(namespaces);
};

const AppWithTheme = ({ Component, pageProps }: AppProps) => {
  const { status } = useSession();
  const { i18n } = useTranslation('common');
  const { user } = useUser();
  const router = useRouter();
  const [colorScheme, setColorScheme] = useLocalStorage<PlayerRace | string>({
    key: 'colorScheme',
    defaultValue: 'ELF',
  });
  const [previewScheme] = useLocalStorage<PlayerRace | ''>({
    key: 'colorSchemePreview',
    defaultValue: '',
  });
  const [theme, setTheme] = useState(themes.ELF);

  useEffect(() => {
    const applyTheme = (cs: string) => setTheme(themes[cs] || themes.ELF);
    if (user?.colorScheme && user.colorScheme !== colorScheme)
      setColorScheme(user.colorScheme);
    const isTestPage = router.pathname === '/test';
    const activeScheme =
      (isTestPage && previewScheme) || user?.colorScheme || colorScheme;
    applyTheme(activeScheme);
  }, [
    user?.colorScheme,
    colorScheme,
    setColorScheme,
    previewScheme,
    router.pathname,
  ]);

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
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      {status === 'loading' ? (
        <Center mih="100vh">
          <Loader size="xl" />
        </Center>
      ) : (
        <LayoutProvider>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </LayoutProvider>
      )}
    </MantineProvider>
  );
};

// Client-side translation loading: namespaces are loaded on-demand via i18next-http-backend
// SEO-critical namespaces should be loaded via serverSideTranslations in individual pages
export default appWithTranslation(MyApp, nextI18NextConfig);
