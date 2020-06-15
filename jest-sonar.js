/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */

const replace = require("replace-in-file")

async function run() {
  try {
    const regex = path => new RegExp(path, "gi")
    const results = await replace({
      files: "reports/test/result.xml",
      from: [
        regex("/home/ldiego/Documents/Github/ldiego73.github.io"),
        regex("/home/runner/work/ldiego73.github.io/ldiego73.github.io"),
      ],
      to: "/github/workspace",
    })
    console.log("Replacement results:", results)
  } catch (error) {
    console.error("Error occurred:", error)
  }
}

run()
