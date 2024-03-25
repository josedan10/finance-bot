// Add any custom config to be passed to Jest
const customJestConfig = {
	testEnvironment: 'node',
	testTimeout: 10000,
	moduleDirectories: ['node_modules'],
	preset: 'ts-jest',
	setupFilesAfterEnv: ['<rootDir>/modules/database/database.module.mock.ts'],
	transform: {
		'node_modules/variables/.+\\.(j|t)sx?$': 'ts-jest',
	},
	transformIgnorePatterns: ['node_modules/(?!variables/.*)'],
	modulePathIgnorePatterns: [
		'<rootDir>/dist/',
		'<rootDir>/controllers/',
		'<rootDir>/database/',
		'<rootDir>/modules/crons/task-queue.cron.ts',
		'<rootDir>/modules/crons/index.ts',
		'<rootDir>/src/__generated__/',
		'<rootDir>/src/config.ts',
	],
	verbose: true,
	collectCoverage: true,
	collectCoverageFrom: [
		'!**/node_modules/**',
		'!**/bin/**',
		'!**/dist/**',
		'!**/controllers/**',
		'!**/*.test.ts',
		'!**/*.json',
		'!**/*.config.ts',
		'!**/app.ts',
		'!**/mock/**',
		'!**/coverage/**',
		'!**/prisma/**',
		'!**/modules/database/**',
		'!**/routes/**',
		'!**/src/enums/**',
		'!**/modules/crons/task-queue.cron.ts',
		'!**/scraper.*',
		'!**/src/config.ts',
	],
	coverageThreshold: {
		'./src/**/*.ts': {
			lines: 85,
		},
		'./modules/**/*.ts': {
			lines: 85,
		},
	},
};

module.exports = customJestConfig;
