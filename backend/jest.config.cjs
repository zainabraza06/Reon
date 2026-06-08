/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  transform: {},
  testMatch: ["**/src/tests/**/*.test.js"],
  globalSetup:    "./src/tests/globalSetup.js",
  globalTeardown: "./src/tests/globalTeardown.js",
  setupFilesAfterEnv: ["./src/tests/setup.js"],
  testTimeout: 30000,
  verbose: true,
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/tests/**",
    "!src/server.js",
  ],
  coverageReporters: ["text", "lcov"],
};
