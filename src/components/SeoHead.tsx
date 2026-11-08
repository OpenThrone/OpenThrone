import Head from 'next/head';
import { useRouter } from 'next/router';
import React from 'react';

import { resolveArtworkSource } from '@/utils/artwork';

const SITE_URL = 'https://openthrone.dev';
const DEFAULT_OG_IMAGE = resolveArtworkSource('/assets/header/OpenThrone.webp');
const LOCALES = ['en', 'de', 'es'] as const;
const DEFAULT_LOCALE = 'en';

/** Absolute URL of a path in a locale; the default locale has no prefix. */
const localizedUrl = (path: string, locale: string) =>
  `${SITE_URL}${locale === DEFAULT_LOCALE ? '' : `/${locale}`}${path === '/' && locale !== DEFAULT_LOCALE ? '' : path}`;

interface SeoHeadProps {
  title: string;
  description: string;
  ogImage?: string;
  ogType?: string;
}

const SeoHead: React.FC<SeoHeadProps> = ({
  title,
  description,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
}) => {
  const router = useRouter();
  // The query string and fragment never belong in a canonical address.
  const path = router.asPath.split(/[?#]/)[0] || '/';
  const canonical = localizedUrl(path, router.locale ?? DEFAULT_LOCALE);

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <link rel="canonical" href={canonical} />
      {LOCALES.map((locale) => (
        <link
          key={locale}
          rel="alternate"
          hrefLang={locale}
          href={localizedUrl(path, locale)}
        />
      ))}
      <link
        rel="alternate"
        hrefLang="x-default"
        href={localizedUrl(path, DEFAULT_LOCALE)}
      />
      <meta property="og:url" content={canonical} />
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta property="og:site_name" content="OpenThrone" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}
    </Head>
  );
};

export default SeoHead;
