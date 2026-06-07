import Head from 'next/head';
import { useRouter } from 'next/router';
import React from 'react';

const SITE_URL = 'https://openthrone.dev';
const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/header/OpenThrone.webp`;

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
  const url = `${SITE_URL}${router.asPath}`;

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="OpenThrone" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </Head>
  );
};

export default SeoHead;
