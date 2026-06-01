/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  // ESM support — run with NODE_OPTIONS=--experimental-vm-modules
  extensionsToTreatAsEsm: [".js"],
  transform: {},           // no Babel transform; native ESM
  testMatch: ["**/src/tests/**/*.test.js"],
  setupFilesAfterFramework: [],
  globalSetup:    "./src/tests/globalSetup.js",
  globalTeardown: "./src/tests/globalTeardown.js",
  setupFilesAfterEnv: ["./src/tests/setup.js"],
  testTimeout: 30000,
  // suppress noisy logs in test output
  silent: false,
  verbose: true,
};
