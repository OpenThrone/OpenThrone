import 'tailwindcss/tailwind.css';
import '@/styles/global.css';
import 'rpg-awesome/css/rpg-awesome.min.css';
import "@fortawesome/fontawesome-svg-core/styles.css";
import '@mantine/core/styles.css';
import { config } from "@fortawesome/fontawesome-svg-core";
config.autoAddCss = false;

import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import React, { Suspense } from 'react';

import Layout from '@/components/Layout'; // Import the Layout component
import { LayoutProvider } from '@/context/LayoutContext';
import { UserProvider } from '@/context/users';
import { createTheme, MantineProvider } from '@mantine/core';
import LoadingDots from '@/components/loading-dots';


const MyApp = ({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps) => (
  <Suspense fallback={<LoadingDots/>}>
    <SessionProvider session={session}>
      <MantineProvider defaultColorScheme="dark">
      <UserProvider>
        <LayoutProvider>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </LayoutProvider>
        </UserProvider>
      </MantineProvider>
    </SessionProvider>
  </Suspense>
);

export default MyApp;
