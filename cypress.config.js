/* eslint-disable import/no-extraneous-dependencies */
const { defineConfig } = require('cypress');

try {
  require('dotenv').config();
} catch {
  // dotenv is optional; Cypress env can be supplied via shell env vars.
}

const defaultAppUrl =
  process.env.CYPRESS_APP_URL ||
  process.env.APP_URL ||
  'http://localhost:3001';

module.exports = defineConfig({
  env: {
    APP_URL: defaultAppUrl,
  },
  video: true,
  e2e: {
    baseUrl: defaultAppUrl,
    specPattern: 'cypress/e2e/**/*.{cy,spec}.{js,jsx,ts,tsx}',
    setupNodeEvents(on) {
      on('before:browser:launch', (browser = {}, launchOptions) => {
        if (browser.family === 'chromium' || browser.name === 'electron') {
          launchOptions.args.push('--no-sandbox');
          launchOptions.args.push('--disable-dev-shm-usage');
        }

        return launchOptions;
      });
    },
  },
});
