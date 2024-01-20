/* eslint-disable import/no-extraneous-dependencies */
const { defineConfig } = require('cypress');
require('dotenv').config();

module.exports = defineConfig({
  e2e: {
    baseUrl: 'https://OpenThrone.dev',
    setupNodeEvents(on, config) {
      const { env, ...rest } = config;
      const modifiedConfig = {
        ...rest,
        env: {
          ...process.env,
          ...env,
        },
      };
      return modifiedConfig;
    },
  },
});
