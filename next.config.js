/* eslint-disable no-unused-vars */

/* eslint-disable import/no-extraneous-dependencies */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  experimental: {
    reactCompiler: true,
    // serverActions: true,
    swcPlugins: [
      [
        'next-superjson-plugin',
        {
          excluded: [],
        },
      ],
    ],
    instrumentationHook: true,
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
  images: {
    domains: ['assets.openthrone.dev'], 
  },
  publicRuntimeConfig: {
    apiUrl:
      process.env.NODE_ENV === 'development'
        ? 'https://alpha.openthrone.dev/api' // development api
        : 'https://openthrone.dev/api', // production api
  },
  reactStrictMode: true,
});
