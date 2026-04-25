import { config } from '../config';

const DEFAULT_SECURITY_ALLOWED_ROLES = ['dev'];

function normalizeRoleList(roles: string[]): string[] {
	const normalized = (roles ?? [])
		.map((role) => role.trim())
		.filter(Boolean);

	if (normalized.length === 0) {
		return DEFAULT_SECURITY_ALLOWED_ROLES;
	}

	return [...new Set(normalized)];
}

export function getSecurityDashboardAllowedRoles(rawRoles: string[] = config.SECURITY_DASHBOARD_ALLOWED_ROLES): string[] {
	return normalizeRoleList(rawRoles);
}

export function canAccessSecurityDashboard(role: string | null | undefined, allowedRoles = getSecurityDashboardAllowedRoles()): boolean {
	const normalizedRole = role?.trim();

	if (!normalizedRole) {
		return false;
	}

	return allowedRoles.includes(normalizedRole);
}

export function getSecurityDashboardRoute(rawRoute = config.SECURITY_DASHBOARD_ROUTE): string {
	return rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`;
}
