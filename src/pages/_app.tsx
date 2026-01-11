import 'tailwindcss/tailwind.css';
import '@/styles/global.css';
import '@opendominion/rpg-awesome/css/rpg-awesome.min.css';
import "@fortawesome/fontawesome-svg-core/styles.css";
import '@mantine/core/styles.css';
import '@mantine/tiptap/styles.css';
import { config } from "@fortawesome/fontawesome-svg-core";
config.autoAddCss = false;

import React, { Suspense, useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { SessionProvider, useSession } from 'next-auth/react';
import { Center, MantineProvider, Loader } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';

import Layout from '@/components/Layout'; // Import the Layout component
import { LayoutProvider } from '@/context/LayoutContext';
import { UserProvider, useUser } from '@/context/users';
import LoadingDots from '@/components/loading-dots';
import { themes } from '@/styles/themes';
import type { PlayerRace } from '@/types/typings';
import { SnackbarProvider } from '@/context/snackbar-context';
import SnackbarBridge from '@/components/SnackbarBridge';

const MyApp = ({ Component, pageProps: { session, ...pageProps }, router }) => (
  <Suspense fallback={<LoadingDots />}>
    <SessionProvider session={session}>
      <SnackbarProvider>
        <UserProvider>
          <SnackbarBridge />
          <AppWithTheme Component={Component} pageProps={pageProps} router={router} />
        </UserProvider>
      </SnackbarProvider>
    </SessionProvider>
  </Suspense>
);

const AppWithTheme = ({ Component, pageProps }: AppProps) => {
  const { status } = useSession();
  const { user } = useUser();
  const router = useRouter();
  const [colorScheme, setColorScheme] = useLocalStorage<PlayerRace | string>({ key: 'colorScheme', defaultValue: 'ELF' });
  const [previewScheme] = useLocalStorage<PlayerRace | ''>({ key: 'colorSchemePreview', defaultValue: '' });
  const [theme, setTheme] = useState(themes.ELF);

  useEffect(() => {
    const applyTheme = (cs: string) => setTheme(themes[cs] || themes.ELF);
    if (user?.colorScheme && user.colorScheme !== colorScheme) setColorScheme(user.colorScheme);
    const isTestPage = router.pathname === '/test';
    const activeScheme = (isTestPage && previewScheme) || user?.colorScheme || (colorScheme as string);
    applyTheme(activeScheme);
  }, [user?.colorScheme, colorScheme, setColorScheme, previewScheme, router.pathname]);

  return (
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      {status === 'loading' ? (
        <Center mih="100vh"><Loader size="xl" /></Center>
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

export default MyApp;
