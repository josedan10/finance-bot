import { describe, expect, it } from '@jest/globals';
import { areSentryTestEndpointsEnabled } from '../src/lib/sentry-test';

describe('Sentry test endpoint flag', () => {
	it('returns true for supported truthy values', () => {
		expect(areSentryTestEndpointsEnabled('true')).toBe(true);
		expect(areSentryTestEndpointsEnabled('1')).toBe(true);
		expect(areSentryTestEndpointsEnabled('YES')).toBe(true);
		expect(areSentryTestEndpointsEnabled(' on ')).toBe(true);
	});

	it('returns false for unsupported values', () => {
		expect(areSentryTestEndpointsEnabled(undefined)).toBe(false);
		expect(areSentryTestEndpointsEnabled('false')).toBe(false);
		expect(areSentryTestEndpointsEnabled('0')).toBe(false);
	});
});
