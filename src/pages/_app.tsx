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

const MyApp = ({ Component, pageProps: { session, ...pageProps }, router }) => (
  <Suspense fallback={<LoadingDots />}>
    <SessionProvider session={session}>
      <UserProvider>
        <AppWithTheme Component={Component} pageProps={pageProps} router={router} />
      </UserProvider>
    </SessionProvider>
  </Suspense>
);

const AppWithTheme = ({ Component, pageProps, router }: AppProps) => {
  const { data: session, status } = useSession();
  const { user } = useUser();
  const [colorScheme, setColorScheme] = useLocalStorage<PlayerRace | string>({ key: 'colorScheme', defaultValue:'ELF'});
  const [theme, setTheme] = useState(themes.ELF); // Default to ELF theme
  useEffect(() => {
    const applyTheme = (colorScheme: string) => {
      const selectedTheme = themes[colorScheme] || themes.ELF;
      setTheme(selectedTheme);
    };

    if (session?.user?.colorScheme && session.user.colorScheme !== colorScheme) {
      setColorScheme(session.user.colorScheme);
      applyTheme(session.user.colorScheme);
    }

    if (user?.colorScheme) {
      applyTheme(user.colorScheme);
      if (session && session.user) {
        session.user.colorScheme = user.colorScheme; // Sync session with context user
      }
    }
  }, [colorScheme, session, setColorScheme, user]);

  // Show a loading screen while the session data is being loaded
  <MantineProvider defaultColorScheme="dark" theme={theme}>
    {status === 'loading' ? (
      <Center style={{ minHeight: '100vh' }}>
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

  return (
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <LayoutProvider>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </LayoutProvider>
    </MantineProvider>
  );
};

export default MyApp;
