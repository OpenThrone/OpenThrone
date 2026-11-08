import { ColorSchemeScript } from '@mantine/core';
import { Head, Html, Main, NextScript } from 'next/document';
import Script from 'next/script';

import { AppConfig } from '@/utils/AppConfig';

/** Document. */
export default function Document(props) {
  // Next passes the request locale to the document (and in __NEXT_DATA__);
  // pageProps never carried it, so every page used to say lang="en".
  const locale =
    props.locale ??
    props.__NEXT_DATA__?.locale ??
    props.__NEXT_DATA__?.pageProps?.locale ??
    AppConfig.locale;

  return (
    <Html lang={locale || AppConfig.locale}>
      <Head>
        {/* Dev-only react-scan OK */}
        {process.env.NODE_ENV === 'development' && (
          <Script
            src="//unpkg.com/react-scan/dist/auto.global.js"
            strategy="afterInteractive"
            crossOrigin="anonymous"
          />
        )}
        {/* Display fonts are self-hosted (src/styles/global.css). */}
        <ColorSchemeScript defaultColorScheme="dark" />
        <meta name="google-adsense-account" content="ca-pub-5510515377090188" />
        {/* hreflang and canonical links are emitted per page by SeoHead. */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
