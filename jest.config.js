// Add any custom config to be passed to Jest
import * as dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const customJestConfig = {
	testEnvironment: 'node',
	testTimeout: 40000,
	transform: {},
	moduleDirectories: ['node_modules'],
	verbose: true,
	collectCoverage: true,
	preset: 'jest-puppeteer',
	collectCoverageFrom: [
		'!**/node_modules/**',
		'!**/bin/**',
		'!**/*.test.js',
		'!**/*.json',
		'!**/*.config.js',
		'!**/app.js',
		'!**/mock/**',
		'!**/coverage/**',
		'!**/prisma/**',
		'!**/modules/database/**',
		'!**/routes/**',
		'!**/src/enums/**',
		'!**/modules/crons/task-queue.cron.js',
		'!**/scraper.*',
	],
	coverageThreshold: {
		'./src/**/*.js': {
			lines: 85,
		},
		'./modules/**/*.js': {
			lines: 85,
		},
	},
};

export default customJestConfig;
