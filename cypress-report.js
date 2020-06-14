/* eslint-disable import/no-extraneous-dependencies */

const { merge } = require("mochawesome-merge")
const generator = require("mochawesome-report-generator")

async function run() {
  const title = "Personal Site - E2E Test"
  const jsonReport = await merge({
    files: ["./reports/e2e/results/*.json"],
  })

  await generator.create(jsonReport, {
    reportFilename: "result.html",
    reportDir: "./reports/e2e",
    reportTitle: title,
    reportPageTitle: title,
    inline: true,
    enableCharts: true,
  })
}

run()
