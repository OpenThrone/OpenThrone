import { Head, Html, Main, NextScript } from 'next/document';
import { ColorSchemeScript } from '@mantine/core';
import { AppConfig } from '@/utils/AppConfig';
import Script from 'next/script';

export default function Document(props) {
  const { locale } = props.__NEXT_DATA__?.pageProps || { locale: AppConfig.locale };
  
    return (
      <Html lang={locale || AppConfig.locale}>
        <Head>
          {/* Dev-only react-scan OK */}
          {process.env.NODE_ENV === 'development' && (
            <Script src="//unpkg.com/react-scan/dist/auto.global.js" strategy="afterInteractive" crossOrigin="anonymous" />
          )}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href="https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap" rel="stylesheet" />
          <link href="https://fonts.cdnfonts.com/css/chomsky?styles=20850&display=swap" rel="stylesheet" />
          <ColorSchemeScript defaultColorScheme="dark" />
          <meta name="google-adsense-account" content="ca-pub-5510515377090188"></meta>
          {/* hreflang tags for SEO */}
          <link rel="alternate" hrefLang="x-default" href="https://openthrone.dev/en" />
          <link rel="alternate" hrefLang="es" href="https://openthrone.dev/es" />
          <link rel="alternate" hrefLang="de" href="https://openthrone.dev/de" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
}