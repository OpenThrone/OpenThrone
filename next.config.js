/* eslint-disable no-unused-vars */
/* eslint-disable import/no-extraneous-dependencies */

const path = require('path');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  /** Stop file-tracing from walking your home dir */
  outputFileTracingRoot: path.join(__dirname),

  /** Optional: smaller deploys; good with Bun + Docker */
  output: 'standalone',

  reactCompiler: true,

  turbopack: {},
  typescript: {
    ignoreBuildErrors: true,
  },

  poweredByHeader: true,
  trailingSlash: false,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_ASSETS_HOSTNAME,
        pathname: '/**',
      },
    ],
  },

  reactStrictMode: true,
});