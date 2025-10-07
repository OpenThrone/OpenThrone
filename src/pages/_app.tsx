import 'tailwindcss/tailwind.css';
import '@/styles/global.css';
import '@opendominion/rpg-awesome/css/rpg-awesome.min.css';
import "@fortawesome/fontawesome-svg-core/styles.css";
import '@mantine/core/styles.css';
import '@mantine/tiptap/styles.css';
import { config } from "@fortawesome/fontawesome-svg-core";
config.autoAddCss = false;

import type { AppProps } from 'next/app';
import { SessionProvider, useSession } from 'next-auth/react';
import React, { Suspense, useEffect, useState } from 'react';

import Layout from '@/components/Layout'; // Import the Layout component
import { LayoutProvider } from '@/context/LayoutContext';
import { UserProvider, useUser } from '@/context/users';
import { Center, MantineProvider, Loader } from '@mantine/core';
import LoadingDots from '@/components/loading-dots';
import { themes } from '@/styles/themes';
import { PlayerRace } from '@/types/typings';
import { useLocalStorage } from '@mantine/hooks';
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
  const [colorScheme, setColorScheme] = useLocalStorage<PlayerRace | string>({ key: 'colorScheme', defaultValue: 'ELF' });
  const [theme, setTheme] = useState(themes.ELF);

  useEffect(() => {
    const applyTheme = (cs: string) => setTheme(themes[cs] || themes.ELF);
    if (user?.colorScheme && user.colorScheme !== colorScheme) setColorScheme(user.colorScheme);
    applyTheme(user?.colorScheme || (colorScheme as string));
  }, [user?.colorScheme, colorScheme, setColorScheme]);

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
