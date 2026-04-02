const truthyEnvValues = new Set(['1', 'true', 'yes', 'on']);

export const areSentryTestEndpointsEnabled = (rawValue = process.env.SENTRY_TEST_ENDPOINTS_ENABLED): boolean => {
	if (!rawValue) {
		return false;
	}

	return truthyEnvValues.has(rawValue.trim().toLowerCase());
};
