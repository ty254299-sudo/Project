const { defineConfig } = require('cypress');

module.exports = defineConfig({
  video: false,
  screenshotOnRunFailure: true,
  e2e: {
    baseUrl: 'http://127.0.0.1:8081',
    specPattern: 'tests/e2e/**/*.cy.js',
    supportFile: false,
    defaultCommandTimeout: 10000,
  },
});
