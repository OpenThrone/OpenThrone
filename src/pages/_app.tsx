import 'tailwindcss/tailwind.css';
import '@/styles/global.css';
import 'rpg-awesome/css/rpg-awesome.min.css';
import "@fortawesome/fontawesome-svg-core/styles.css";
import '@mantine/core/styles.css';
import { config } from "@fortawesome/fontawesome-svg-core";
config.autoAddCss = false;

import type { AppProps } from 'next/app';
import { SessionProvider, useSession } from 'next-auth/react';
import React, { Suspense, useEffect, useState } from 'react';

import Layout from '@/components/Layout'; // Import the Layout component
import { LayoutProvider } from '@/context/LayoutContext';
import { UserProvider, useUser } from '@/context/users';
import { MantineProvider } from '@mantine/core';
import LoadingDots from '@/components/loading-dots';
import { themes } from '@/styles/themes';

const MyApp = ({ Component, pageProps: { session, ...pageProps } }) => (
  <Suspense fallback={<LoadingDots />}>
    <SessionProvider session={session}>
      <UserProvider>
        <AppWithTheme Component={Component} pageProps={pageProps} />
      </UserProvider>
    </SessionProvider>
  </Suspense>
);

const AppWithTheme = ({ Component, pageProps }: AppProps) => {
  const { data: session, status } = useSession();
  const { user } = useUser();
  const [theme, setTheme] = useState(themes.ELF); // Default to ELF theme

  useEffect(() => {
    const applyTheme = (colorScheme: string) => {
      const selectedTheme = themes[colorScheme] || themes.ELF;
      setTheme(selectedTheme);
    };

    if (session?.user?.colorScheme) {
      applyTheme(session.user.colorScheme);
    }

    if (user?.colorScheme) {
      applyTheme(user.colorScheme);
      if (session && session.user) {
        session.user.colorScheme = user.colorScheme; // Sync session with context user
      }
    }
  }, [session, user]);

  // Show a loading screen while the session data is being loaded
  if (status === 'loading') {
    return <LoadingDots />;
  }

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
