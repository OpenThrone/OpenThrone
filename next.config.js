/* eslint-disable no-unused-vars */
/* eslint-disable import/no-extraneous-dependencies */

const path = require('path');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
const { i18n } = require('./next-i18next.config');

module.exports = withBundleAnalyzer({
  i18n,
  /** Stop file-tracing from walking your home dir */
  outputFileTracingRoot: path.join(__dirname),

  /** Optional: smaller deploys; good with Bun + Docker */
  output: 'standalone',

  reactCompiler: true,

  turbopack: {},
  typescript: {
    ignoreBuildErrors: true,
  },

  webpack: (config, { isServer }) => {
    // Fix for bcrypt and other native modules
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        child_process: false,
        dns: false,
      };
    }

    // Mark bcrypt as external for server-side only
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        bcrypt: 'commonjs bcrypt',
      });
    }

    // Fix for @mapbox/node-pre-gyp HTML files being processed as modules
    // Exclude HTML files in node-pre-gyp from being processed by webpack
    const originalRule = config.module.rules.find(
      (rule) => rule.test && rule.test.test && rule.test.test('.html'),
    );

    if (originalRule) {
      // Add exclude to existing HTML rule if it exists
      originalRule.exclude = [
        ...(originalRule.exclude || []),
        /node_modules\/@mapbox\/node-pre-gyp\/lib\/util\/nw-pre-gyp\//,
      ];
    } else {
      // Create a new rule to exclude these HTML files
      config.module.rules.push({
        test: /\.html$/,
        exclude: /node_modules\/@mapbox\/node-pre-gyp\/lib\/util\/nw-pre-gyp\//,
        type: 'asset/resource',
        generator: {
          emit: false, // Don't emit these files to the build output
        },
      });
    }

    return config;
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
