/* eslint-disable import/no-extraneous-dependencies */
const { defineConfig } = require("cypress")

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:8000/",
    specPattern: "cypress/e2e/**/*.test.js",
    supportFile: "cypress/support/index.js",
  },
  screenshotsFolder: "reports/e2e/screenshots",
  videosFolder: "reports/e2e/videos",
  videoCompression: 23,
  reporter: "mochawesome",
  reporterOptions: {
    reportDir: "reports/e2e/results",
    overwrite: false,
    html: false,
    json: true,
  },
})
