import 'tailwindcss/tailwind.css';
import '@/styles/global.css';
import 'rpg-awesome/css/rpg-awesome.min.css';

import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import React, { Suspense } from 'react';

import Layout from '@/components/Layout'; // Import the Layout component
import { LayoutProvider } from '@/context/LayoutContext';
import { UserProvider } from '@/context/users';

const MyApp = ({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps) => (
  <Suspense>
    <SessionProvider session={session}>
      <UserProvider>
        <LayoutProvider>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </LayoutProvider>
      </UserProvider>
    </SessionProvider>
  </Suspense>
);

export default MyApp;
