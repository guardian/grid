import type { Config } from 'jest';

const config: Config = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.ts'],
	testPathIgnorePatterns: [
		'/node_modules/',
		// Skip integration tests by default — they require real AWS / LocalStack
		'/__tests__/embedder/integration/',
		'/__tests__/backfiller/integration/',
	],
	moduleFileExtensions: ['ts', 'js', 'json'],
};

export default config;
