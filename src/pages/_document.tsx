import { Head, Html, Main, NextScript } from 'next/document';
import { ColorSchemeScript } from '@mantine/core';
import { AppConfig } from '@/utils/AppConfig';
import Script from 'next/script';

export default function Document(props) {
  
    return (
      <Html lang={AppConfig.locale}>
        <Head>
          {process.env.NODE_ENV === 'development' && (
            <Script
              src="//unpkg.com/react-scan/dist/auto.global.js"
              strategy="afterInteractive"
              crossOrigin="anonymous"
            />
          )}
          <link
            href="https://fonts.cdnfonts.com/css/chomsky&display=optional"
            rel="stylesheet"
          />
          <link href='https://fonts.googleapis.com/css?family=MedievalSharp&display=optional' rel='stylesheet' />
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