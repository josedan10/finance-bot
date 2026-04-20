import { canAccessSecurityDashboard, getSecurityDashboardAllowedRoles, getSecurityDashboardRoute } from './security-access';

describe('security-access', () => {
	test('falls back to dev when no allowed roles are configured', () => {
		expect(getSecurityDashboardAllowedRoles([])).toEqual(['dev']);
	});

	test('normalizes, deduplicates, and preserves configured roles', () => {
		expect(getSecurityDashboardAllowedRoles([' dev ', 'admin', 'dev'])).toEqual(['dev', 'admin']);
	});

	test('allows access only for configured roles', () => {
		const allowedRoles = ['dev', 'admin'];

		expect(canAccessSecurityDashboard('dev', allowedRoles)).toBe(true);
		expect(canAccessSecurityDashboard('admin', allowedRoles)).toBe(true);
		expect(canAccessSecurityDashboard('user', allowedRoles)).toBe(false);
		expect(canAccessSecurityDashboard(undefined, allowedRoles)).toBe(false);
	});

	test('normalizes the configured dashboard route', () => {
		expect(getSecurityDashboardRoute('/ops/security-monitor')).toBe('/ops/security-monitor');
		expect(getSecurityDashboardRoute('ops/security-monitor')).toBe('/ops/security-monitor');
	});
});
