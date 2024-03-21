import { Head, Html, Main, NextScript } from 'next/document';

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
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
}