import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('config', () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalSecurityAlertsEnabled = process.env.SECURITY_ALERTS_ENABLED;

	beforeEach(() => {
		jest.resetModules();
	});

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
		process.env.SECURITY_ALERTS_ENABLED = originalSecurityAlertsEnabled;
		jest.resetModules();
	});

	it('disables security alerts by default outside production', async () => {
		process.env.NODE_ENV = 'development';
		delete process.env.SECURITY_ALERTS_ENABLED;

		const { config } = await import('./config');

		expect(config.SECURITY_ALERTS_ENABLED).toBe(false);
	});

	it('enables security alerts by default in production', async () => {
		process.env.NODE_ENV = 'production';
		delete process.env.SECURITY_ALERTS_ENABLED;

		const { config } = await import('./config');

		expect(config.SECURITY_ALERTS_ENABLED).toBe(true);
	});

	it('honors an explicit SECURITY_ALERTS_ENABLED override', async () => {
		process.env.NODE_ENV = 'production';
		process.env.SECURITY_ALERTS_ENABLED = 'false';

		const { config } = await import('./config');

		expect(config.SECURITY_ALERTS_ENABLED).toBe(false);
	});
});
