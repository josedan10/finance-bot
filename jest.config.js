// Add any custom config to be passed to Jest
import * as dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const customJestConfig = {
	testTimeout: 8000,
	transform: {},
	moduleDirectories: ['node_modules'],
	verbose: true,
	collectCoverage: true,
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
	],
	coverageThreshold: {
		'./routes/**/*.js': {
			lines: 85,
		},
		'./src/**/*.js': {
			lines: 85,
		},
		'./modules/**/*.js': {
			lines: 83,
		},
	},
};

export default customJestConfig;
