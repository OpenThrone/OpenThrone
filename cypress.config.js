/* eslint-disable import/no-extraneous-dependencies */
const { defineConfig } = require('cypress');
require('dotenv').config();

module.exports = defineConfig({
  e2e: {
    baseUrl: 'https://OpenThrone.dev',
    setupNodeEvents(on, config) {
      config.env = {
        ...process.env,
        ...config.env,
      };
      return config;
    },
  },
});
