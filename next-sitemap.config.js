/** @type {import('next-sitemap').IConfig} */

// Only public pages belong in the sitemap; everything else needs a login, is
// staff-only or is a developer page.
const PRIVATE_PATHS = [
  '/home/*',
  '/home',
  '/administration/*',
  '/structures/*',
  '/battle/users',
  '/battle/training',
  '/battle/upgrades',
  '/battle/history',
  '/battle/results/*',
  '/alliances*',
  '/messaging',
  '/social/*',
  '/report',
  '/account/delete-request',
  '/account/email-verify',
  '/auth/*',
  '/email/*',
  '/test',
  '/test/*',
  '/socket-test',
];

module.exports = {
  siteUrl: 'https://openthrone.dev',
  generateRobotsTxt: true,
  exclude: PRIVATE_PATHS.flatMap((path) => [path, `/de${path}`, `/es${path}`]),
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/home/',
          '/administration/',
          '/structures/',
          '/messaging',
          '/test',
          '/socket-test',
        ],
      },
    ],
  },
};
