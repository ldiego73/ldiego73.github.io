/* eslint-disable max-len */
module.exports = {
  transform: {
    "^.+\\.jsx?$": "<rootDir>/jest-preprocess.js",
  },
  moduleNameMapper: {
    ".+\\.(css|styl|less|sass|scss)$": "identity-obj-proxy",
    ".+\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/__mocks__/file-mock.js",
    "^@mocks(.*)$": "<rootDir>/__mocks__$1",
    "^@src(.*)$": "<rootDir>/src$1",
    "^@data(.*)$": "<rootDir>/src/data$1",
    "^@components(.*)$": "<rootDir>/src/components$1",
    "^@context(.*)$": "<rootDir>/src/context$1",
    "^@hooks(.*)$": "<rootDir>/src/hooks$1",
    "^@images(.*)$": "<rootDir>/src/images$1",
    "^@pages(.*)$": "<rootDir>/src/pages$1",
    "^@layouts(.*)$": "<rootDir>/src/layouts$1",
    "^@screens(.*)$": "<rootDir>/src/screens$1",
    "^@styles(.*)$": "<rootDir>/src/styles$1",
    "^@utils(.*)$": "<rootDir>/src/utils$1",
  },
  testEnvironment: "jsdom",
  testPathIgnorePatterns: ["node_modules", ".cache", "cypress"],
  transformIgnorePatterns: ["node_modules/(?!(gatsby)/)"],
  globals: {
    __PATH_PREFIX__: "",
  },
  reporters: [
    "default",
    [
      "jest-html-reporters",
      {
        publicPath: "reports/test",
        filename: "result.html",
        pageTitle: "Personal Site - Unit Test",
      },
    ],
  ],
  collectCoverage: true,
  collectCoverageFrom: ["src/**/*.js", "!**/node_modules/**"],
  coverageReporters: ["json", "text", "lcov", "html"],
  coverageDirectory: "reports/coverage",
  testResultsProcessor: "jest-sonar-reporter",
  testEnvironmentOptions: {
    url: "http://localhost",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  setupFiles: ["<rootDir>/loadershim.js"],
}
