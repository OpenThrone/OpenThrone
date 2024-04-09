import { Head, Html, Main, NextScript } from 'next/document';
import { ColorSchemeScript } from '@mantine/core';
import { AppConfig } from '@/utils/AppConfig';

export default function Document() {
  
    return (
      <Html lang={AppConfig.locale}>
        <Head>
          <link
            href="https://fonts.cdnfonts.com/css/chomsky"
            rel="stylesheet"
          />
          <link href='https://fonts.googleapis.com/css?family=MedievalSharp' rel='stylesheet' />
          <ColorSchemeScript defaultColorScheme="dark" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
}