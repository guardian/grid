/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/integration/'  // Skip integration tests by default
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
