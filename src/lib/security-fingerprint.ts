import { createHash } from 'crypto';
import type { Request } from 'express';

export type SecurityFingerprint = {
	ip: string;
	ipHash: string;
	userAgent?: string;
	browserName?: string;
	browserVersion?: string;
	osName?: string;
	osVersion?: string;
	deviceType?: string;
	deviceBrand?: string;
	deviceModel?: string;
	referer?: string;
	origin?: string;
	host?: string;
	forwardedFor?: string;
	realIp?: string;
	forwardedProto?: string;
	forwardedHost?: string;
	forwardedPort?: string;
	forwardedServer?: string;
	acceptLanguage?: string;
	secChUa?: string;
	secChUaPlatform?: string;
	secChUaMobile?: string;
	country?: string;
	region?: string;
	city?: string;
	attributionSource?: string;
	attributionTrusted: boolean;
};

export function hashSecurityIp(ip: string): string {
	return createHash('sha256').update(ip).digest('hex').slice(0, 12);
}

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	return Array.isArray(value) ? value[0] : value;
}

export function extractClientIp(req: Pick<Request, 'ip' | 'headers' | 'socket'>): string {
	const resolvedReqIp = req.ip?.replace(/^::ffff:/, '');
	const forwardedFor = normalizeHeaderValue(req.headers['x-forwarded-for']);
	const forwardedIp = forwardedFor?.split(',')[0]?.trim();
	const realIp = normalizeHeaderValue(req.headers['x-real-ip']);
	const rawIp = resolvedReqIp || forwardedIp || realIp || req.socket.remoteAddress || 'unknown';

	return rawIp.replace(/^::ffff:/, '');
}

function detectBrowser(userAgent: string | undefined): { name?: string; version?: string } {
	if (!userAgent) {
		return {};
	}

	const patterns: Array<{ name: string; regex: RegExp }> = [
		{ name: 'Edge', regex: /edg\/([0-9.]+)/i },
		{ name: 'Opera', regex: /(?:opr|opera)\/([0-9.]+)/i },
		{ name: 'Chrome', regex: /chrome\/([0-9.]+)/i },
		{ name: 'Firefox', regex: /firefox\/([0-9.]+)/i },
		{ name: 'Safari', regex: /version\/([0-9.]+).*safari/i },
		{ name: 'curl', regex: /curl\/([0-9.]+)/i },
		{ name: 'python-requests', regex: /python-requests\/([0-9.]+)/i },
	];

	for (const pattern of patterns) {
		const match = userAgent.match(pattern.regex);
		if (match) {
			return {
				name: pattern.name,
				version: match[1],
			};
		}
	}

	return {};
}

function detectOperatingSystem(
	userAgent: string | undefined,
	platformHint: string | undefined
): { name?: string; version?: string } {
	const normalizedPlatformHint = platformHint?.replace(/"/g, '');
	if (normalizedPlatformHint) {
		const normalizedLower = normalizedPlatformHint.toLowerCase();
		if (normalizedLower === 'android') {
			const androidVersion = userAgent?.match(/android\s([0-9.]+)/i)?.[1];
			return { name: 'Android', version: androidVersion };
		}
		if (normalizedLower === 'windows') {
			const windowsVersion = userAgent?.match(/windows nt\s([0-9.]+)/i)?.[1];
			return { name: 'Windows', version: windowsVersion };
		}
		if (normalizedLower === 'macos') {
			const macVersion = userAgent?.match(/mac os x\s([0-9_]+)/i)?.[1]?.replace(/_/g, '.');
			return { name: 'macOS', version: macVersion };
		}

		return { name: normalizedPlatformHint };
	}

	if (!userAgent) {
		return {};
	}

	const patterns: Array<{ name: string; regex: RegExp; normalize?: (value: string) => string }> = [
		{ name: 'Windows', regex: /windows nt\s([0-9.]+)/i },
		{ name: 'Android', regex: /android\s([0-9.]+)/i },
		{ name: 'iOS', regex: /(?:iphone os|cpu os)\s([0-9_]+)/i, normalize: (value) => value.replace(/_/g, '.') },
		{ name: 'macOS', regex: /mac os x\s([0-9_]+)/i, normalize: (value) => value.replace(/_/g, '.') },
		{ name: 'Linux', regex: /linux/i },
	];

	for (const pattern of patterns) {
		const match = userAgent.match(pattern.regex);
		if (match) {
			return {
				name: pattern.name,
				version: match[1] ? (pattern.normalize ? pattern.normalize(match[1]) : match[1]) : undefined,
			};
		}
	}

	return {};
}

function detectDevice(
	userAgent: string | undefined,
	mobileHint: string | undefined
): Pick<SecurityFingerprint, 'deviceType' | 'deviceBrand' | 'deviceModel'> {
	if (mobileHint === '?1') {
		return { deviceType: 'Mobile' };
	}
	if (mobileHint === '?0') {
		return { deviceType: 'Desktop' };
	}
	if (!userAgent) {
		return {};
	}
	if (/(tablet|ipad)/i.test(userAgent)) {
		return { deviceType: 'Tablet', deviceBrand: /ipad/i.test(userAgent) ? 'Apple' : undefined };
	}
	if (/(mobile|iphone|android)/i.test(userAgent)) {
		return {
			deviceType: 'Mobile',
			deviceBrand: /iphone/i.test(userAgent) ? 'Apple' : /android/i.test(userAgent) ? 'Android' : undefined,
		};
	}

	return { deviceType: 'Desktop' };
}

function resolveAttributionSource(req: Pick<Request, 'ip' | 'headers' | 'socket'>): { source: string; trusted: boolean } {
	const forwardedFor = normalizeHeaderValue(req.headers['x-forwarded-for']);
	const realIp = normalizeHeaderValue(req.headers['x-real-ip']);

	if (forwardedFor) {
		return { source: 'x-forwarded-for', trusted: true };
	}

	if (realIp) {
		return { source: 'x-real-ip', trusted: true };
	}

	if (req.ip) {
		return { source: 'req.ip', trusted: true };
	}

	if (req.socket.remoteAddress) {
		return { source: 'socket', trusted: false };
	}

	return { source: 'unknown', trusted: false };
}

export function collectSecurityFingerprint(req: Request): SecurityFingerprint {
	const userAgent = req.get('user-agent') ?? undefined;
	const secChUaPlatform = req.get('sec-ch-ua-platform') ?? undefined;
	const secChUaMobile = req.get('sec-ch-ua-mobile') ?? undefined;
	const browser = detectBrowser(userAgent);
	const os = detectOperatingSystem(userAgent, secChUaPlatform);
	const device = detectDevice(userAgent, secChUaMobile);
	const attribution = resolveAttributionSource(req);
	const ip = extractClientIp(req);

	return {
		ip,
		ipHash: hashSecurityIp(ip),
		userAgent,
		browserName: browser.name,
		browserVersion: browser.version,
		osName: os.name,
		osVersion: os.version,
		deviceType: device.deviceType,
		deviceBrand: device.deviceBrand,
		deviceModel: device.deviceModel,
		referer: req.get('referer') ?? undefined,
		origin: req.get('origin') ?? undefined,
		host: req.get('host') ?? undefined,
		forwardedFor: normalizeHeaderValue(req.headers['x-forwarded-for']),
		realIp: req.get('x-real-ip') ?? undefined,
		forwardedProto: req.get('x-forwarded-proto') ?? undefined,
		forwardedHost: req.get('x-forwarded-host') ?? undefined,
		forwardedPort: req.get('x-forwarded-port') ?? undefined,
		forwardedServer: req.get('x-forwarded-server') ?? undefined,
		acceptLanguage: req.get('accept-language') ?? undefined,
		secChUa: req.get('sec-ch-ua') ?? undefined,
		secChUaPlatform,
		secChUaMobile,
		country: req.get('cf-ipcountry') ?? req.get('x-vercel-ip-country') ?? undefined,
		region: req.get('x-vercel-ip-country-region') ?? undefined,
		city: req.get('x-vercel-ip-city') ?? undefined,
		attributionSource: attribution.source,
		attributionTrusted: attribution.trusted,
	};
}
