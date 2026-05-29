import { describe, expect, test } from '@jest/globals';
import type { Request } from 'express';
import { collectSecurityFingerprint } from './security-fingerprint';

function buildRequest(headers: Record<string, string | undefined>): Request {
	return {
		ip: '198.51.100.24',
		headers,
		socket: { remoteAddress: '198.51.100.24' },
		get(name: string): string | undefined {
			return headers[name.toLowerCase()];
		},
	} as unknown as Request;
}

describe('collectSecurityFingerprint location fallbacks', () => {
	test('prefers forwarded public IP over proxy socket IP', () => {
		const request = buildRequest({
			'x-forwarded-for': '203.0.113.10, 10.0.0.2',
		});

		const fingerprint = collectSecurityFingerprint(request);

		expect(fingerprint.ip).toBe('203.0.113.10');
		expect(fingerprint.forwardedFor).toBe('203.0.113.10, 10.0.0.2');
	});

	test('reads Cloudflare geo headers when available', () => {
		const request = buildRequest({
			'cf-ipcountry': 'US',
			'cf-region': 'California',
			'cf-ipcity': 'San Francisco',
			'cf-timezone': 'America/Los_Angeles',
		});

		const fingerprint = collectSecurityFingerprint(request);

		expect(fingerprint.country).toBe('US');
		expect(fingerprint.region).toBe('California');
		expect(fingerprint.city).toBe('San Francisco');
		expect(fingerprint.timezone).toBe('America/Los_Angeles');
	});

	test('falls back to Vercel/edge alternative geo headers', () => {
		const request = buildRequest({
			'x-vercel-ip-country': 'AR',
			'x-vercel-ip-region': 'B',
			'x-vercel-ip-country-city': 'Buenos Aires',
			'x-geo-timezone': 'America/Argentina/Buenos_Aires',
		});

		const fingerprint = collectSecurityFingerprint(request);

		expect(fingerprint.country).toBe('AR');
		expect(fingerprint.region).toBe('B');
		expect(fingerprint.city).toBe('Buenos Aires');
		expect(fingerprint.timezone).toBe('America/Argentina/Buenos_Aires');
	});

	test('ignores placeholder geo values like unknown', () => {
		const request = buildRequest({
			'cf-ipcountry': 'unknown',
			'x-country-code': 'US',
			'cf-region': 'unknown',
			'x-region': 'TX',
			'cf-ipcity': 'unknown',
			'x-city': 'Austin',
		});

		const fingerprint = collectSecurityFingerprint(request);

		expect(fingerprint.country).toBe('US');
		expect(fingerprint.region).toBe('TX');
		expect(fingerprint.city).toBe('Austin');
	});
});
