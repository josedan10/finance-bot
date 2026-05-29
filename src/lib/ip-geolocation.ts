import { config } from '../config';
import type { SecurityFingerprint } from './security-fingerprint';

type IpWhoIsResponse = {
	success?: boolean;
	country_code?: string;
	region?: string;
	city?: string;
	timezone?: { id?: string } | string;
	message?: string;
};

export type IpGeolocation = Pick<SecurityFingerprint, 'country' | 'region' | 'city' | 'timezone'>;

const geoCache = new Map<string, IpGeolocation | null>();

function isGeoEnrichmentEnabled(): boolean {
	if (process.env.NODE_ENV === 'test' && process.env.SECURITY_GEO_ENRICHMENT_ENABLED === undefined) {
		return false;
	}

	return config.SECURITY_GEO_ENRICHMENT_ENABLED;
}

function isPublicIp(ip: string): boolean {
	if (!ip || ip === 'unknown') return false;
	if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.')) return false;
	if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;
	if (/^169\.254\./.test(ip)) return false;
	if (/^fc|^fd/i.test(ip)) return false;

	return true;
}

function getTimezone(value: IpWhoIsResponse['timezone']): string | undefined {
	if (!value) return undefined;
	return typeof value === 'string' ? value : value.id;
}

function normalizeCountryCode(value: string | undefined): string | undefined {
	const normalized = value?.trim().toUpperCase();
	return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

export async function lookupIpGeolocation(ip: string): Promise<IpGeolocation | null> {
	if (!isGeoEnrichmentEnabled() || !isPublicIp(ip)) {
		return null;
	}

	if (geoCache.has(ip)) {
		return geoCache.get(ip) ?? null;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), config.SECURITY_GEO_ENRICHMENT_TIMEOUT_MS);

	try {
		const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
			signal: controller.signal,
			headers: { accept: 'application/json' },
		});

		if (!response.ok) {
			geoCache.set(ip, null);
			return null;
		}

		const data = (await response.json()) as IpWhoIsResponse;
		const country = normalizeCountryCode(data.country_code);

		if (!data.success || !country) {
			geoCache.set(ip, null);
			return null;
		}

		const location: IpGeolocation = {
			country,
			region: data.region?.trim() || undefined,
			city: data.city?.trim() || undefined,
			timezone: getTimezone(data.timezone),
		};

		geoCache.set(ip, location);
		return location;
	} catch (_error) {
		geoCache.set(ip, null);
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export async function enrichSecurityFingerprintLocation(
	fingerprint: SecurityFingerprint
): Promise<SecurityFingerprint> {
	if (fingerprint.country) {
		return fingerprint;
	}

	const location = await lookupIpGeolocation(fingerprint.ip);
	if (!location) {
		return fingerprint;
	}

	return {
		...fingerprint,
		country: location.country,
		region: fingerprint.region ?? location.region,
		city: fingerprint.city ?? location.city,
		timezone: fingerprint.timezone ?? location.timezone,
	};
}

export function resetIpGeolocationCacheForTesting(): void {
	geoCache.clear();
}
