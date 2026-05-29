import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { config } from '../config';
import {
	enrichSecurityFingerprintLocation,
	lookupIpGeolocation,
	resetIpGeolocationCacheForTesting,
} from './ip-geolocation';
import type { SecurityFingerprint } from './security-fingerprint';

const originalEnabled = config.SECURITY_GEO_ENRICHMENT_ENABLED;
const originalEnvEnabled = process.env.SECURITY_GEO_ENRICHMENT_ENABLED;

afterEach(() => {
	config.SECURITY_GEO_ENRICHMENT_ENABLED = originalEnabled;
	if (originalEnvEnabled === undefined) {
		delete process.env.SECURITY_GEO_ENRICHMENT_ENABLED;
	} else {
		process.env.SECURITY_GEO_ENRICHMENT_ENABLED = originalEnvEnabled;
	}
	resetIpGeolocationCacheForTesting();
	jest.restoreAllMocks();
});

describe('ip geolocation enrichment', () => {
	test('looks up public IP location when enrichment is enabled', async () => {
		process.env.SECURITY_GEO_ENRICHMENT_ENABLED = 'true';
		config.SECURITY_GEO_ENRICHMENT_ENABLED = true;
		const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({
				success: true,
				country_code: 'nl',
				region: 'North Holland',
				city: 'Amsterdam',
				timezone: { id: 'Europe/Amsterdam' },
			}),
		} as Response);

		const location = await lookupIpGeolocation('8.8.8.8');

		expect(location).toEqual({
			country: 'NL',
			region: 'North Holland',
			city: 'Amsterdam',
			timezone: 'Europe/Amsterdam',
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test('does not call external lookup for private IP addresses', async () => {
		process.env.SECURITY_GEO_ENRICHMENT_ENABLED = 'true';
		config.SECURITY_GEO_ENRICHMENT_ENABLED = true;
		const fetchMock = jest.spyOn(global, 'fetch');

		const location = await lookupIpGeolocation('10.0.0.12');

		expect(location).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('enriches a fingerprint without overriding existing edge header data', async () => {
		process.env.SECURITY_GEO_ENRICHMENT_ENABLED = 'true';
		config.SECURITY_GEO_ENRICHMENT_ENABLED = true;
		jest.spyOn(global, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({ success: true, country_code: 'US', region: 'Virginia', city: 'Ashburn' }),
		} as Response);
		const fingerprint: SecurityFingerprint = {
			ip: '8.8.4.4',
			ipHash: 'hash',
			attributionTrusted: true,
		};

		const enriched = await enrichSecurityFingerprintLocation(fingerprint);

		expect(enriched.country).toBe('US');
		expect(enriched.region).toBe('Virginia');
		expect(enriched.city).toBe('Ashburn');
	});
});
