// Add any custom config to be passed to Jest
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

const customJestConfig = {
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
	],
	coverageThreshold: {
		'./routes/**/*.js': {
			lines: 85,
		},
	},
};

module.exports = customJestConfig;
