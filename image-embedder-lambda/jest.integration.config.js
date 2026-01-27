/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/integration/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  // Integration tests may take longer due to real AWS calls
  testTimeout: 30000,
  // Suppress console.log output when running tests
  silent: true,
  // Show individual test results
  verbose: true,
  // Required for AWS SDK v3 compatibility
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: false,
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
        },
      },
    ],
  },
};
