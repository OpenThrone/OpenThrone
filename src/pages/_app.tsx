// eslint-disable-next-line import/no-extraneous-dependencies
import 'tailwindcss/tailwind.css';
import '../styles/global.css';
import 'rpg-awesome/css/rpg-awesome.min.css';

import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';

import { UserProvider } from '@/context/users';

const MyApp = ({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps) => (
  <SessionProvider session={session}>
    <UserProvider>
      <Component {...pageProps} />
    </UserProvider>
  </SessionProvider>
);

export default MyApp;
