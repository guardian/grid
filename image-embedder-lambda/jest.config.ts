import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  testPathIgnorePatterns: [
    "/node_modules/",
    // Skip integration tests by default, because these call Bedrock for real,
    // costing us time, money and throughput
    "/__tests__/integration/",
  ],
  moduleFileExtensions: ["ts", "js", "json"],
};

export default config;
