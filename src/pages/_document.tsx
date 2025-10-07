import { Head, Html, Main, NextScript } from 'next/document';
import { ColorSchemeScript } from '@mantine/core';
import { AppConfig } from '@/utils/AppConfig';
import Script from 'next/script';

export default function Document(props) {
  
    return (
      <Html lang={AppConfig.locale}>
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
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
}