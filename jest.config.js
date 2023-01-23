// Add any custom config to be passed to Jest
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

const customJestConfig = {
	testTimeout: 8000,
	moduleDirectories: ['node_modules'],
	verbose: true,
	collectCoverage: true,
	collectCoverageFrom: [
		'!**/node_modules/**',
		'!**/*.test.js',
		'!**/*.json',
		'!**/*.config.js',
		'!**/app.js',
		'!**/mock/**',
		'!**/coverage/**',
		'!**/modules/google-sheets/*.js',
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

module.exports = customJestConfig;
