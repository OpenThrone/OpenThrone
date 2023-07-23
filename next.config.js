/* eslint-disable import/no-extraneous-dependencies */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  experimental: {
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
  },
  poweredByHeader: true,
  trailingSlash: false,
  basePath: '',
  serverRuntimeConfig: {
    dbConfig: {
      host: '192.168.4.4',
      port: 5432, // 3306
      user: 'dt',
      password: 'darkthrone',
      database: 'darkthrone',
    },
    secret: 'TESTSTRING', // 'jfhb2c1viUK85E2YdMZcuNN372OosxZkMtx4cOtPg7mc7QInQkMJOEQag9W7uSs6yTeYStWdjFG89GftA0IfMh5BfPlW0IqYadekqPEgbs2g1SgTNTpH6nTld8le',
  },
  publicRuntimeConfig: {
    apiUrl:
      process.env.NODE_ENV === 'development'
        ? 'http://192.168.4.19:3000/api' // development api
        : 'http://192.168.4.19:3000/api', // production api
  },
  // The starter code load resources from `public` folder with `router.basePath` in React components.
  // So, the source code is "basePath-ready".
  // You can remove `basePath` if you don't need it.
  reactStrictMode: true,
  serverActions: true,
});
