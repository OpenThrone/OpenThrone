const webpack = require('webpack');
/* eslint-disable import/no-extraneous-dependencies */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  experimental: {
    // serverActions: true,
    swcPlugins: [
      [
        'next-superjson-plugin',
        {
          excluded: [],
        },
      ],
    ],
  },
  eslint: {
    dirs: ['.'],
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  poweredByHeader: true,
  trailingSlash: false,
  basePath: '',

  publicRuntimeConfig: {
    apiUrl:
      process.env.NODE_ENV === 'development'
        ? 'http://192.168.4.19:3000/api' // development api
        : 'https://OpenThrone.dev/api', // production api
  },
  // The starter code load resources from `public` folder with `router.basePath` in React components.
  // So, the source code is "basePath-ready".
  // You can remove `basePath` if you don't need it.
  reactStrictMode: true,
});
