import { Prisma } from '@prisma/client';
import { PrismaModule as prisma } from '../../modules/database/database.module';
import logger from './logger';
import { config } from '../config';
import { redisClient } from './redis';
import { hashSecurityIp, type SecurityFingerprint } from './security-fingerprint';

export type SecurityEventKind =
	| 'blocked_path'
	| 'not_found'
	| 'rate_limit'
	| 'auto_block_created'
	| 'active_block_denied'
	| 'manual_block_created'
	| 'manual_block_removed';

export type SecurityEventAction =
	| 'blocked'
	| 'not_found'
	| 'rate_limited'
	| 'auto_block_created'
	| 'active_block_denied'
	| 'manual_block_created'
	| 'manual_block_removed';

export type PersistSecurityEventInput = {
	kind: SecurityEventKind;
	action: SecurityEventAction;
	method: string;
	path: string;
	statusCode?: number;
	matchedRule?: string;
	requestCount?: number;
	windowMs?: number;
	blockId?: number | null;
	fingerprint: SecurityFingerprint;
};

export type SecurityEventRecord = {
	id: number;
	createdAt: string;
	kind: SecurityEventKind;
	action: SecurityEventAction;
	method: string;
	path: string;
	statusCode: number | null;
	ip: string;
	ipHash: string;
	forwardedFor?: string;
	realIp?: string;
	host?: string;
	origin?: string;
	referer?: string;
	userAgent?: string;
	browserName?: string;
	browserVersion?: string;
	osName?: string;
	osVersion?: string;
	deviceType?: string;
	deviceBrand?: string;
	deviceModel?: string;
	acceptLanguage?: string;
	timezone?: string;
	country?: string;
	region?: string;
	city?: string;
	attributionSource?: string;
	attributionTrusted: boolean;
	matchedRule?: string;
	requestCount?: number;
	windowMs?: number;
	blockId?: number | null;
	authenticatedUserId?: number | null;
	authenticatedUserEmail?: string;
	metadataJson?: Prisma.JsonValue | null;
};

export type SecurityBlockRecord = {
	id: number;
	createdAt: string;
	updatedAt: string;
	ip: string;
	ipHash: string;
	source: 'auto' | 'manual';
	reason: string | null;
	active: boolean;
	expiresAt: string | null;
	removedAt: string | null;
	removedBy: number | null;
	relatedAuthenticatedUserId?: number | null;
	relatedAuthenticatedUserEmail?: string;
	metadataJson?: Prisma.JsonValue | null;
};

export type SecurityEventQueryInput = {
	from?: Date;
	to?: Date;
	path?: string;
	action?: string;
	ip?: string;
	page?: number;
	pageSize?: number;
};

export type SecurityBlockQueryInput = {
	active?: boolean;
	ip?: string;
	page?: number;
	pageSize?: number;
};

export type SecuritySummaryInput = {
	from?: Date;
	to?: Date;
};

export type SecuritySummary = {
	range: {
		from: string;
		to: string;
	};
	totals: {
		events: number;
		uniqueOrigins: number;
		blockedPaths: number;
		rateLimited: number;
		autoBlocks: number;
		activeBlockDenials: number;
		manualBlocksCreated: number;
		manualBlocksRemoved: number;
		activeBlocks: number;
		recentBlocks: number;
	};
	topPaths: Array<{ path: string; count: number }>;
	topOrigins: Array<{ ip: string; ipHash: string; count: number }>;
};

type SuspiciousActivityResult = {
	requestCount: number;
	autoBlockCreated: boolean;
	blockId: number | null;
};

type ActiveBlockResult = {
	blocked: boolean;
	blockId: number | null;
};

type PaginatedSecurityResult<T> = {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
};

type MemoryCounterEntry = {
	count: number;
	expiresAt: number;
};

type MemoryBlockEntry = {
	blockId: number;
	expiresAt: number | null;
};

type CreateManualSecurityBlockInput = {
	ip: string;
	reason?: string;
	expiresInMinutes?: number | null;
	actorUserId?: number | null;
};

const memorySuspiciousCounters = new Map<string, MemoryCounterEntry>();
const memorySecurityBlocks = new Map<string, MemoryBlockEntry>();
const recordedSecurityEvents: SecurityEventRecord[] = [];
const recordedSecurityBlocks: SecurityBlockRecord[] = [];
let nextRecordedEventId = 1;
let nextMemoryBlockId = 1;

function buildSecurityCounterKey(ip: string): string {
	return `security:suspicious-count:${ip}`;
}

function buildSecurityBlockKey(ip: string): string {
	return `security:blocked-ip:${ip}`;
}

function cleanupExpiredMemoryEntries(now = Date.now()): void {
	for (const [key, value] of memorySuspiciousCounters.entries()) {
		if (value.expiresAt <= now) {
			memorySuspiciousCounters.delete(key);
		}
	}

	for (const [key, value] of memorySecurityBlocks.entries()) {
		if (value.expiresAt !== null && value.expiresAt <= now) {
			memorySecurityBlocks.delete(key);
		}
	}
}

function normalizePage(value?: number): number {
	if (!Number.isFinite(value) || !value || value < 1) {
		return 1;
	}

	return Math.floor(value);
}

function normalizePageSize(value?: number): number {
	if (!Number.isFinite(value) || !value || value < 1) {
		return 25;
	}

	return Math.min(100, Math.floor(value));
}

function paginate<T>(items: T[], page?: number, pageSize?: number): PaginatedSecurityResult<T> {
	const normalizedPage = normalizePage(page);
	const normalizedPageSize = normalizePageSize(pageSize);
	const total = items.length;
	const totalPages = total === 0 ? 0 : Math.ceil(total / normalizedPageSize);
	const start = (normalizedPage - 1) * normalizedPageSize;

	return {
		items: items.slice(start, start + normalizedPageSize),
		total,
		page: normalizedPage,
		pageSize: normalizedPageSize,
		totalPages,
	};
}

function fingerprintMetadata(fingerprint: SecurityFingerprint): Prisma.InputJsonValue {
	return {
		forwardedPort: fingerprint.forwardedPort ?? null,
		forwardedServer: fingerprint.forwardedServer ?? null,
		secChUa: fingerprint.secChUa ?? null,
		secChUaPlatform: fingerprint.secChUaPlatform ?? null,
		secChUaMobile: fingerprint.secChUaMobile ?? null,
		timezone: fingerprint.timezone ?? null,
		deviceBrand: fingerprint.deviceBrand ?? null,
		deviceModel: fingerprint.deviceModel ?? null,
		authenticatedUserId: fingerprint.authenticatedUserId ?? null,
		authenticatedUserEmail: fingerprint.authenticatedUserEmail ?? null,
		authenticatedFirebaseId: fingerprint.authenticatedFirebaseId ?? null,
	} as Prisma.InputJsonValue;
}

function extractMetadataString(
	metadata: Prisma.JsonValue | null | undefined,
	key: string
): string | undefined {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return undefined;
	}

	const value = (metadata as Record<string, Prisma.JsonValue>)[key];
	return typeof value === 'string' ? value : undefined;
}

function buildSecurityEventRecord(input: PersistSecurityEventInput, id: number, createdAt = new Date()): SecurityEventRecord {
	return {
		id,
		createdAt: createdAt.toISOString(),
		kind: input.kind,
		action: input.action,
		method: input.method,
		path: input.path,
		statusCode: input.statusCode ?? null,
		ip: input.fingerprint.ip,
		ipHash: input.fingerprint.ipHash,
		forwardedFor: input.fingerprint.forwardedFor,
		realIp: input.fingerprint.realIp,
		host: input.fingerprint.host,
		origin: input.fingerprint.origin,
		referer: input.fingerprint.referer,
		userAgent: input.fingerprint.userAgent,
		browserName: input.fingerprint.browserName,
		browserVersion: input.fingerprint.browserVersion,
		osName: input.fingerprint.osName,
		osVersion: input.fingerprint.osVersion,
		deviceType: input.fingerprint.deviceType,
		deviceBrand: input.fingerprint.deviceBrand,
		deviceModel: input.fingerprint.deviceModel,
		acceptLanguage: input.fingerprint.acceptLanguage,
		timezone: input.fingerprint.timezone,
		country: input.fingerprint.country,
		region: input.fingerprint.region,
		city: input.fingerprint.city,
		attributionSource: input.fingerprint.attributionSource,
		attributionTrusted: input.fingerprint.attributionTrusted,
		matchedRule: input.matchedRule,
		requestCount: input.requestCount,
		windowMs: input.windowMs,
		blockId: input.blockId ?? null,
		authenticatedUserId: input.fingerprint.authenticatedUserId ?? null,
		authenticatedUserEmail: input.fingerprint.authenticatedUserEmail,
		metadataJson: fingerprintMetadata(input.fingerprint) as Prisma.JsonValue,
	};
}

function buildSecurityBlockRecord(input: {
	id: number;
	ip: string;
	source: 'auto' | 'manual';
	reason?: string | null;
	expiresAt?: Date | null;
	removedBy?: number | null;
	metadataJson?: Prisma.JsonValue | null;
}): SecurityBlockRecord {
	const now = new Date().toISOString();

	return {
		id: input.id,
		createdAt: now,
		updatedAt: now,
		ip: input.ip,
		ipHash: hashSecurityIp(input.ip),
		source: input.source,
		reason: input.reason?.trim() || null,
		active: true,
		expiresAt: input.expiresAt?.toISOString() ?? null,
		removedAt: null,
		removedBy: input.removedBy ?? null,
		metadataJson: input.metadataJson ?? null,
	};
}

function buildManualFingerprint(ip: string): SecurityFingerprint {
	return {
		ip,
		ipHash: hashSecurityIp(ip),
		attributionSource: 'manual',
		attributionTrusted: true,
	};
}

function getExpiryDate(expiresInMinutes?: number | null): Date | null {
	if (!Number.isFinite(expiresInMinutes) || !expiresInMinutes || expiresInMinutes <= 0) {
		return null;
	}

	return new Date(Date.now() + expiresInMinutes * 60_000);
}

function isWithinRange(timestamp: string, from?: Date, to?: Date): boolean {
	const value = Date.parse(timestamp);

	if (Number.isNaN(value)) {
		return false;
	}

	if (from && value < from.getTime()) {
		return false;
	}

	if (to && value > to.getTime()) {
		return false;
	}

	return true;
}

function isSecurityBlockCurrentlyActive(block: Pick<SecurityBlockRecord, 'active' | 'expiresAt' | 'removedAt'>, now = Date.now()): boolean {
	if (!block.active || Boolean(block.removedAt)) {
		return false;
	}

	if (block.expiresAt && Date.parse(block.expiresAt) <= now) {
		return false;
	}

	return true;
}

function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]): T[] {
	return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function matchEventFilters(event: SecurityEventRecord, filters: SecurityEventQueryInput): boolean {
	if (!isWithinRange(event.createdAt, filters.from, filters.to)) {
		return false;
	}

	if (filters.path && !event.path.toLowerCase().includes(filters.path.toLowerCase())) {
		return false;
	}

	if (filters.action && event.action !== filters.action) {
		return false;
	}

	if (filters.ip && event.ip !== filters.ip) {
		return false;
	}

	return true;
}

function matchBlockFilters(block: SecurityBlockRecord, filters: SecurityBlockQueryInput): boolean {
	if (filters.ip && block.ip !== filters.ip) {
		return false;
	}

	if (typeof filters.active === 'boolean') {
		return filters.active ? isSecurityBlockCurrentlyActive(block) : !isSecurityBlockCurrentlyActive(block);
	}

	return true;
}

function buildSecurityEventWhere(filters: SecurityEventQueryInput): Prisma.SecurityEventWhereInput {
	const where: Prisma.SecurityEventWhereInput = {};

	if (filters.from || filters.to) {
		where.createdAt = {
			...(filters.from ? { gte: filters.from } : {}),
			...(filters.to ? { lte: filters.to } : {}),
		};
	}

	if (filters.path) {
		where.path = {
			contains: filters.path,
		};
	}

	if (filters.action) {
		where.action = filters.action;
	}

	if (filters.ip) {
		where.ip = filters.ip;
	}

	return where;
}

function buildActiveBlockWhere(now: Date, ip?: string): Prisma.SecurityBlockWhereInput {
	return {
		...(ip ? { ip } : {}),
		active: true,
		removedAt: null,
		OR: [
			{ expiresAt: null },
			{ expiresAt: { gt: now } },
		],
	};
}

async function incrementSuspiciousCount(ip: string, windowMs: number): Promise<number> {
	if (process.env.NODE_ENV === 'test' || !process.env.REDIS_URL) {
		const now = Date.now();
		cleanupExpiredMemoryEntries(now);
		const key = buildSecurityCounterKey(ip);
		const existing = memorySuspiciousCounters.get(key);

		if (!existing || existing.expiresAt <= now) {
			memorySuspiciousCounters.set(key, {
				count: 1,
				expiresAt: now + windowMs,
			});
			return 1;
		}

		existing.count += 1;
		return existing.count;
	}

	const client = await redisClient.getClient();
	const key = buildSecurityCounterKey(ip);
	const result = (await client.eval(
		`
			local current = redis.call('INCR', KEYS[1])
			if current == 1 then
				redis.call('PEXPIRE', KEYS[1], ARGV[1])
			end
			return current
		`,
		{
			keys: [key],
			arguments: [String(windowMs)],
		}
	)) as number | string;

	return Number(result);
}

async function setActiveBlock(ip: string, blockId: number, expiresAt?: Date | null): Promise<void> {
	if (process.env.NODE_ENV === 'test' || !process.env.REDIS_URL) {
		cleanupExpiredMemoryEntries();
		memorySecurityBlocks.set(buildSecurityBlockKey(ip), {
			blockId,
			expiresAt: expiresAt ? expiresAt.getTime() : null,
		});
		return;
	}

	if (expiresAt) {
		const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
		await redisClient.set(buildSecurityBlockKey(ip), String(blockId), {
			EX: ttlSeconds,
		});
		return;
	}

	await redisClient.set(buildSecurityBlockKey(ip), String(blockId));
}

async function clearActiveBlock(ip: string): Promise<void> {
	if (process.env.NODE_ENV === 'test' || !process.env.REDIS_URL) {
		memorySecurityBlocks.delete(buildSecurityBlockKey(ip));
		return;
	}

	await redisClient.del(buildSecurityBlockKey(ip));
}

async function syncActiveBlockStateForIp(ip: string): Promise<void> {
	if (process.env.NODE_ENV === 'test') {
		const activeBlock = sortByCreatedAtDesc(recordedSecurityBlocks).find(
			(block) => block.ip === ip && isSecurityBlockCurrentlyActive(block)
		);

		if (!activeBlock) {
			await clearActiveBlock(ip);
			return;
		}

		await setActiveBlock(ip, activeBlock.id, activeBlock.expiresAt ? new Date(activeBlock.expiresAt) : null);
		return;
	}

	const now = new Date();
	const activeBlock = await prisma.securityBlock.findFirst({
		where: buildActiveBlockWhere(now, ip),
		orderBy: {
			createdAt: 'desc',
		},
	});

	if (!activeBlock) {
		await clearActiveBlock(ip);
		return;
	}

	await setActiveBlock(ip, activeBlock.id, activeBlock.expiresAt ?? null);
}

async function persistSecurityBlock(ip: string, reason: string): Promise<SecurityBlockRecord> {
	const expiresAt = new Date(Date.now() + config.SECURITY_AUTO_BLOCK_TTL_MINUTES * 60_000);
	const metadataJson = {
		ttlMinutes: config.SECURITY_AUTO_BLOCK_TTL_MINUTES,
	} as Prisma.JsonValue;

	if (process.env.NODE_ENV === 'test') {
		const block = buildSecurityBlockRecord({
			id: nextMemoryBlockId,
			ip,
			source: 'auto',
			reason,
			expiresAt,
			metadataJson,
		});
		nextMemoryBlockId += 1;
		recordedSecurityBlocks.push(block);
		return block;
	}

	const block = await prisma.securityBlock.create({
		data: {
			ip,
			ipHash: hashSecurityIp(ip),
			source: 'auto',
			reason,
			expiresAt,
			metadataJson: metadataJson as Prisma.InputJsonValue,
		},
	});

	return {
		id: block.id,
		createdAt: block.createdAt.toISOString(),
		updatedAt: block.updatedAt.toISOString(),
		ip: block.ip,
		ipHash: block.ipHash,
		source: block.source as 'auto' | 'manual',
		reason: block.reason,
		active: block.active,
		expiresAt: block.expiresAt?.toISOString() ?? null,
		removedAt: block.removedAt?.toISOString() ?? null,
		removedBy: block.removedBy ?? null,
		metadataJson: block.metadataJson,
	};
}

export async function persistSecurityEvent(input: PersistSecurityEventInput): Promise<number | null> {
	if (process.env.NODE_ENV === 'test') {
		recordedSecurityEvents.push(buildSecurityEventRecord(input, nextRecordedEventId));
		nextRecordedEventId += 1;
		return nextRecordedEventId - 1;
	}

	try {
		const event = await prisma.securityEvent.create({
			data: {
				kind: input.kind,
				action: input.action,
				method: input.method,
				path: input.path,
				statusCode: input.statusCode,
				ip: input.fingerprint.ip,
				ipHash: input.fingerprint.ipHash,
				forwardedFor: input.fingerprint.forwardedFor,
				realIp: input.fingerprint.realIp,
				host: input.fingerprint.host,
				origin: input.fingerprint.origin,
				referer: input.fingerprint.referer,
				userAgent: input.fingerprint.userAgent,
				browserName: input.fingerprint.browserName,
				browserVersion: input.fingerprint.browserVersion,
				osName: input.fingerprint.osName,
				osVersion: input.fingerprint.osVersion,
				deviceType: input.fingerprint.deviceType,
				deviceBrand: input.fingerprint.deviceBrand,
				deviceModel: input.fingerprint.deviceModel,
				acceptLanguage: input.fingerprint.acceptLanguage,
				country: input.fingerprint.country,
				region: input.fingerprint.region,
				city: input.fingerprint.city,
				attributionSource: input.fingerprint.attributionSource,
				attributionTrusted: input.fingerprint.attributionTrusted,
				matchedRule: input.matchedRule,
				requestCount: input.requestCount,
				windowMs: input.windowMs,
				blockId: input.blockId,
				authenticatedUserId: input.fingerprint.authenticatedUserId,
				authenticatedUserEmail: input.fingerprint.authenticatedUserEmail,
				metadataJson: fingerprintMetadata(input.fingerprint),
			},
		});

		return event.id;
	} catch (error) {
		logger.error('Failed to persist security event', {
			error: error instanceof Error ? error.message : String(error),
			kind: input.kind,
			path: input.path,
			ipHash: input.fingerprint.ipHash,
		});
		return null;
	}
}

export async function checkActiveSecurityBlock(ip: string): Promise<ActiveBlockResult> {
	if (process.env.NODE_ENV === 'test' || !process.env.REDIS_URL) {
		cleanupExpiredMemoryEntries();
		const existing = memorySecurityBlocks.get(buildSecurityBlockKey(ip));
		return {
			blocked: Boolean(existing),
			blockId: existing?.blockId ?? null,
		};
	}

	const blockValue = await redisClient.get(buildSecurityBlockKey(ip));

	if (!blockValue) {
		return { blocked: false, blockId: null };
	}

	return {
		blocked: true,
		blockId: Number.parseInt(blockValue, 10) || null,
	};
}

export async function registerSuspiciousActivity(input: PersistSecurityEventInput): Promise<SuspiciousActivityResult> {
	const requestCount = await incrementSuspiciousCount(input.fingerprint.ip, config.SECURITY_SUSPICIOUS_WINDOW_MS);

	await persistSecurityEvent({
		...input,
		requestCount,
		windowMs: input.windowMs ?? config.SECURITY_SUSPICIOUS_WINDOW_MS,
	});

	const existingBlock = await checkActiveSecurityBlock(input.fingerprint.ip);
	if (existingBlock.blocked) {
		return {
			requestCount,
			autoBlockCreated: false,
			blockId: existingBlock.blockId,
		};
	}

	if (requestCount < config.SECURITY_SUSPICIOUS_MAX_EVENTS) {
		return {
			requestCount,
			autoBlockCreated: false,
			blockId: null,
		};
	}

	try {
		const block = await persistSecurityBlock(
			input.fingerprint.ip,
			`Automatic security block after ${requestCount} suspicious events`
		);
		await setActiveBlock(input.fingerprint.ip, block.id, block.expiresAt ? new Date(block.expiresAt) : null);
		await persistSecurityEvent({
			kind: 'auto_block_created',
			action: 'auto_block_created',
			method: input.method,
			path: input.path,
			statusCode: 403,
			matchedRule: 'security-threshold',
			requestCount,
			windowMs: config.SECURITY_SUSPICIOUS_WINDOW_MS,
			blockId: block.id,
			fingerprint: input.fingerprint,
		});

		return {
			requestCount,
			autoBlockCreated: true,
			blockId: block.id,
		};
	} catch (error) {
		logger.error('Failed to create automatic security block', {
			error: error instanceof Error ? error.message : String(error),
			ipHash: input.fingerprint.ipHash,
		});

		return {
			requestCount,
			autoBlockCreated: false,
			blockId: null,
		};
	}
}

export async function listSecurityEvents(filters: SecurityEventQueryInput = {}): Promise<PaginatedSecurityResult<SecurityEventRecord>> {
	if (process.env.NODE_ENV === 'test') {
		const filtered = sortByCreatedAtDesc(recordedSecurityEvents.filter((event) => matchEventFilters(event, filters)));
		return paginate(filtered, filters.page, filters.pageSize);
	}

	const where = buildSecurityEventWhere(filters);
	const page = normalizePage(filters.page);
	const pageSize = normalizePageSize(filters.pageSize);
	const [items, total] = await Promise.all([
		prisma.securityEvent.findMany({
			where,
			orderBy: {
				createdAt: 'desc',
			},
			skip: (page - 1) * pageSize,
			take: pageSize,
		}),
		prisma.securityEvent.count({ where }),
	]);

	return {
		items: items.map((event) => ({
			id: event.id,
			createdAt: event.createdAt.toISOString(),
			kind: event.kind as SecurityEventKind,
			action: event.action as SecurityEventAction,
			method: event.method,
			path: event.path,
			statusCode: event.statusCode ?? null,
			ip: event.ip,
			ipHash: event.ipHash,
			forwardedFor: event.forwardedFor ?? undefined,
			realIp: event.realIp ?? undefined,
			host: event.host ?? undefined,
			origin: event.origin ?? undefined,
			referer: event.referer ?? undefined,
			userAgent: event.userAgent ?? undefined,
			browserName: event.browserName ?? undefined,
			browserVersion: event.browserVersion ?? undefined,
			osName: event.osName ?? undefined,
			osVersion: event.osVersion ?? undefined,
			deviceType: event.deviceType ?? undefined,
			deviceBrand: event.deviceBrand ?? undefined,
			deviceModel: event.deviceModel ?? undefined,
			acceptLanguage: event.acceptLanguage ?? undefined,
			timezone: extractMetadataString(event.metadataJson, 'timezone'),
			country: event.country ?? undefined,
			region: event.region ?? undefined,
			city: event.city ?? undefined,
			attributionSource: event.attributionSource ?? undefined,
			attributionTrusted: event.attributionTrusted,
			matchedRule: event.matchedRule ?? undefined,
				requestCount: event.requestCount ?? undefined,
				windowMs: event.windowMs ?? undefined,
				blockId: event.blockId ?? null,
				authenticatedUserId: event.authenticatedUserId ?? null,
				authenticatedUserEmail: event.authenticatedUserEmail ?? undefined,
				metadataJson: event.metadataJson,
			})),
		total,
		page,
		pageSize,
		totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
	};
}

function buildRelatedAuthenticatedUsersByIpForTest(
	ips: string[]
): Map<string, { authenticatedUserId: number | null; authenticatedUserEmail: string }> {
	const uniqueIps = [...new Set(ips)];
	const result = new Map<string, { authenticatedUserId: number | null; authenticatedUserEmail: string }>();

	for (const ip of uniqueIps) {
		const relatedEvent = sortByCreatedAtDesc(recordedSecurityEvents).find(
			(event) => event.ip === ip && Boolean(event.authenticatedUserEmail)
		);

		if (relatedEvent?.authenticatedUserEmail) {
			result.set(ip, {
				authenticatedUserId: relatedEvent.authenticatedUserId ?? null,
				authenticatedUserEmail: relatedEvent.authenticatedUserEmail,
			});
		}
	}

	return result;
}

async function buildRelatedAuthenticatedUsersByIp(
	ips: string[]
): Promise<Map<string, { authenticatedUserId: number | null; authenticatedUserEmail: string }>> {
	const uniqueIps = [...new Set(ips)];
	const result = new Map<string, { authenticatedUserId: number | null; authenticatedUserEmail: string }>();

	if (uniqueIps.length === 0) {
		return result;
	}

	const relatedEvents = await prisma.securityEvent.findMany({
		where: {
			ip: { in: uniqueIps },
			authenticatedUserEmail: { not: null },
		},
		select: {
			ip: true,
			authenticatedUserId: true,
			authenticatedUserEmail: true,
			createdAt: true,
		},
		orderBy: {
			createdAt: 'desc',
		},
	});

	for (const event of relatedEvents) {
		if (!event.authenticatedUserEmail || result.has(event.ip)) {
			continue;
		}

		result.set(event.ip, {
			authenticatedUserId: event.authenticatedUserId ?? null,
			authenticatedUserEmail: event.authenticatedUserEmail,
		});
	}

	return result;
}

export async function listSecurityBlocks(filters: SecurityBlockQueryInput = {}): Promise<PaginatedSecurityResult<SecurityBlockRecord>> {
	if (process.env.NODE_ENV === 'test') {
		const filtered = sortByCreatedAtDesc(recordedSecurityBlocks.filter((block) => matchBlockFilters(block, filters)));
		const paginated = paginate(filtered, filters.page, filters.pageSize);
		const relatedUsersByIp = buildRelatedAuthenticatedUsersByIpForTest(paginated.items.map((block) => block.ip));

		return {
			...paginated,
			items: paginated.items.map((block) => ({
				...block,
				relatedAuthenticatedUserId: relatedUsersByIp.get(block.ip)?.authenticatedUserId ?? null,
				relatedAuthenticatedUserEmail: relatedUsersByIp.get(block.ip)?.authenticatedUserEmail,
			})),
		};
	}

	const now = new Date();
	const where: Prisma.SecurityBlockWhereInput = {
		...(filters.ip ? { ip: filters.ip } : {}),
	};

	if (typeof filters.active === 'boolean') {
		if (filters.active) {
			Object.assign(where, buildActiveBlockWhere(now));
		} else {
			Object.assign(where, {
				OR: [
					{ active: false },
					{ removedAt: { not: null } },
					{ expiresAt: { lte: now } },
				],
			});
		}
	}

	const page = normalizePage(filters.page);
	const pageSize = normalizePageSize(filters.pageSize);
	const [items, total] = await Promise.all([
		prisma.securityBlock.findMany({
			where,
			orderBy: {
				createdAt: 'desc',
			},
			skip: (page - 1) * pageSize,
			take: pageSize,
		}),
		prisma.securityBlock.count({ where }),
	]);
	const relatedUsersByIp = await buildRelatedAuthenticatedUsersByIp(items.map((block) => block.ip));

	return {
		items: items.map((block) => ({
			id: block.id,
			createdAt: block.createdAt.toISOString(),
			updatedAt: block.updatedAt.toISOString(),
			ip: block.ip,
			ipHash: block.ipHash,
			source: block.source as 'auto' | 'manual',
			reason: block.reason,
			active: block.active,
			expiresAt: block.expiresAt?.toISOString() ?? null,
			removedAt: block.removedAt?.toISOString() ?? null,
			removedBy: block.removedBy ?? null,
			relatedAuthenticatedUserId: relatedUsersByIp.get(block.ip)?.authenticatedUserId ?? null,
			relatedAuthenticatedUserEmail: relatedUsersByIp.get(block.ip)?.authenticatedUserEmail,
			metadataJson: block.metadataJson,
		})),
		total,
		page,
		pageSize,
		totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
	};
}

export async function getSecuritySummary(input: SecuritySummaryInput = {}): Promise<SecuritySummary> {
	const from = input.from ?? new Date(Date.now() - 24 * 60 * 60_000);
	const to = input.to ?? new Date();

	let events: SecurityEventRecord[];
	let blocks: SecurityBlockRecord[];

	if (process.env.NODE_ENV === 'test') {
		events = recordedSecurityEvents.filter((event) => isWithinRange(event.createdAt, from, to));
		blocks = recordedSecurityBlocks.filter((block) => isWithinRange(block.createdAt, from, to));
	} else {
		const [eventRows, blockRows] = await Promise.all([
			prisma.securityEvent.findMany({
				where: buildSecurityEventWhere({ from, to }),
				orderBy: {
					createdAt: 'desc',
				},
			}),
			prisma.securityBlock.findMany({
				where: {
					createdAt: {
						gte: from,
						lte: to,
					},
				},
				orderBy: {
					createdAt: 'desc',
				},
			}),
		]);

		events = eventRows.map((event) => ({
			id: event.id,
			createdAt: event.createdAt.toISOString(),
			kind: event.kind as SecurityEventKind,
			action: event.action as SecurityEventAction,
			method: event.method,
			path: event.path,
			statusCode: event.statusCode ?? null,
			ip: event.ip,
			ipHash: event.ipHash,
			forwardedFor: event.forwardedFor ?? undefined,
			realIp: event.realIp ?? undefined,
			host: event.host ?? undefined,
			origin: event.origin ?? undefined,
			referer: event.referer ?? undefined,
			userAgent: event.userAgent ?? undefined,
			browserName: event.browserName ?? undefined,
			browserVersion: event.browserVersion ?? undefined,
			osName: event.osName ?? undefined,
			osVersion: event.osVersion ?? undefined,
			deviceType: event.deviceType ?? undefined,
			deviceBrand: event.deviceBrand ?? undefined,
			deviceModel: event.deviceModel ?? undefined,
			acceptLanguage: event.acceptLanguage ?? undefined,
			timezone: extractMetadataString(event.metadataJson, 'timezone'),
			country: event.country ?? undefined,
			region: event.region ?? undefined,
			city: event.city ?? undefined,
			attributionSource: event.attributionSource ?? undefined,
			attributionTrusted: event.attributionTrusted,
			matchedRule: event.matchedRule ?? undefined,
				requestCount: event.requestCount ?? undefined,
				windowMs: event.windowMs ?? undefined,
				blockId: event.blockId ?? null,
				authenticatedUserId: event.authenticatedUserId ?? null,
				authenticatedUserEmail: event.authenticatedUserEmail ?? undefined,
				metadataJson: event.metadataJson,
			}));
		blocks = blockRows.map((block) => ({
			id: block.id,
			createdAt: block.createdAt.toISOString(),
			updatedAt: block.updatedAt.toISOString(),
			ip: block.ip,
			ipHash: block.ipHash,
			source: block.source as 'auto' | 'manual',
			reason: block.reason,
			active: block.active,
			expiresAt: block.expiresAt?.toISOString() ?? null,
			removedAt: block.removedAt?.toISOString() ?? null,
			removedBy: block.removedBy ?? null,
			metadataJson: block.metadataJson,
		}));
	}

	const pathCounts = new Map<string, number>();
	const originCounts = new Map<string, { ip: string; ipHash: string; count: number }>();

	for (const event of events) {
		pathCounts.set(event.path, (pathCounts.get(event.path) ?? 0) + 1);

		const existingOrigin = originCounts.get(event.ip);
		if (existingOrigin) {
			existingOrigin.count += 1;
		} else {
			originCounts.set(event.ip, {
				ip: event.ip,
				ipHash: event.ipHash,
				count: 1,
			});
		}
	}

	return {
		range: {
			from: from.toISOString(),
			to: to.toISOString(),
		},
		totals: {
			events: events.length,
			uniqueOrigins: originCounts.size,
			blockedPaths: events.filter((event) => event.kind === 'blocked_path').length,
			rateLimited: events.filter((event) => event.kind === 'rate_limit').length,
			autoBlocks: events.filter((event) => event.kind === 'auto_block_created').length,
			activeBlockDenials: events.filter((event) => event.kind === 'active_block_denied').length,
			manualBlocksCreated: events.filter((event) => event.kind === 'manual_block_created').length,
			manualBlocksRemoved: events.filter((event) => event.kind === 'manual_block_removed').length,
			activeBlocks: recordedOrFetchedActiveBlocksCount(blocks),
			recentBlocks: blocks.length,
		},
		topPaths: [...pathCounts.entries()]
			.map(([path, count]) => ({ path, count }))
			.sort((left, right) => right.count - left.count)
			.slice(0, 5),
		topOrigins: [...originCounts.values()]
			.sort((left, right) => right.count - left.count)
			.slice(0, 5),
	};
}

function recordedOrFetchedActiveBlocksCount(blocks: SecurityBlockRecord[]): number {
	return blocks.filter((block) => isSecurityBlockCurrentlyActive(block)).length;
}

export async function createManualSecurityBlock(input: CreateManualSecurityBlockInput): Promise<SecurityBlockRecord> {
	const expiresAt = getExpiryDate(input.expiresInMinutes);
	const normalizedReason = input.reason?.trim() || 'Manual security block';
	const metadataJson = {
		expiresInMinutes: input.expiresInMinutes ?? null,
		actorUserId: input.actorUserId ?? null,
	} as Prisma.JsonValue;

	let block: SecurityBlockRecord;

	if (process.env.NODE_ENV === 'test') {
		block = buildSecurityBlockRecord({
			id: nextMemoryBlockId,
			ip: input.ip,
			source: 'manual',
			reason: normalizedReason,
			expiresAt,
			removedBy: input.actorUserId ?? null,
			metadataJson,
		});
		nextMemoryBlockId += 1;
		recordedSecurityBlocks.push(block);
	} else {
		const createdBlock = await prisma.securityBlock.create({
			data: {
				ip: input.ip,
				ipHash: hashSecurityIp(input.ip),
				source: 'manual',
				reason: normalizedReason,
				expiresAt,
				metadataJson: metadataJson as Prisma.InputJsonValue,
			},
		});

		block = {
			id: createdBlock.id,
			createdAt: createdBlock.createdAt.toISOString(),
			updatedAt: createdBlock.updatedAt.toISOString(),
			ip: createdBlock.ip,
			ipHash: createdBlock.ipHash,
			source: createdBlock.source as 'auto' | 'manual',
			reason: createdBlock.reason,
			active: createdBlock.active,
			expiresAt: createdBlock.expiresAt?.toISOString() ?? null,
			removedAt: createdBlock.removedAt?.toISOString() ?? null,
			removedBy: createdBlock.removedBy ?? null,
			metadataJson: createdBlock.metadataJson,
		};
	}

	await setActiveBlock(input.ip, block.id, expiresAt);
	await persistSecurityEvent({
		kind: 'manual_block_created',
		action: 'manual_block_created',
		method: 'POST',
		path: '/api/security/blocks',
		statusCode: 201,
		matchedRule: 'manual-security-block',
		blockId: block.id,
		fingerprint: buildManualFingerprint(input.ip),
	});

	return block;
}

export async function removeSecurityBlock(blockId: number, actorUserId?: number | null): Promise<SecurityBlockRecord | null> {
	if (process.env.NODE_ENV === 'test') {
		const existingBlock = recordedSecurityBlocks.find((block) => block.id === blockId);

		if (!existingBlock) {
			return null;
		}

		existingBlock.active = false;
		existingBlock.removedAt = new Date().toISOString();
		existingBlock.updatedAt = existingBlock.removedAt;
		existingBlock.removedBy = actorUserId ?? null;
		await syncActiveBlockStateForIp(existingBlock.ip);
		await persistSecurityEvent({
			kind: 'manual_block_removed',
			action: 'manual_block_removed',
			method: 'DELETE',
			path: `/api/security/blocks/${blockId}`,
			statusCode: 200,
			matchedRule: 'manual-security-block-removed',
			blockId,
			fingerprint: buildManualFingerprint(existingBlock.ip),
		});

		return existingBlock;
	}

	const existingBlock = await prisma.securityBlock.findUnique({
		where: {
			id: blockId,
		},
	});

	if (!existingBlock) {
		return null;
	}

	const removedAt = new Date();
	const updatedBlock = await prisma.securityBlock.update({
		where: {
			id: blockId,
		},
		data: {
			active: false,
			removedAt,
			removedBy: actorUserId ?? null,
		},
	});

	await syncActiveBlockStateForIp(existingBlock.ip);
	await persistSecurityEvent({
		kind: 'manual_block_removed',
		action: 'manual_block_removed',
		method: 'DELETE',
		path: `/api/security/blocks/${blockId}`,
		statusCode: 200,
		matchedRule: 'manual-security-block-removed',
		blockId,
		fingerprint: buildManualFingerprint(existingBlock.ip),
	});

	return {
		id: updatedBlock.id,
		createdAt: updatedBlock.createdAt.toISOString(),
		updatedAt: updatedBlock.updatedAt.toISOString(),
		ip: updatedBlock.ip,
		ipHash: updatedBlock.ipHash,
		source: updatedBlock.source as 'auto' | 'manual',
		reason: updatedBlock.reason,
		active: updatedBlock.active,
		expiresAt: updatedBlock.expiresAt?.toISOString() ?? null,
		removedAt: updatedBlock.removedAt?.toISOString() ?? null,
		removedBy: updatedBlock.removedBy ?? null,
		metadataJson: updatedBlock.metadataJson,
	};
}

export async function removeActiveSecurityBlocksByIp(
	ip: string,
	actorUserId?: number | null
): Promise<{ removedCount: number; removedBlocks: SecurityBlockRecord[] }> {
	const activeBlocks = await listSecurityBlocks({ active: true, ip, page: 1, pageSize: 100 });
	if (activeBlocks.items.length === 0) {
		return { removedCount: 0, removedBlocks: [] };
	}

	const removedBlocks: SecurityBlockRecord[] = [];
	for (const block of activeBlocks.items) {
		const removed = await removeSecurityBlock(block.id, actorUserId);
		if (removed) {
			removedBlocks.push(removed);
		}
	}

	return {
		removedCount: removedBlocks.length,
		removedBlocks,
	};
}

export function getRecordedSecurityEventsForTesting(): ReadonlyArray<SecurityEventRecord> {
	return recordedSecurityEvents;
}

export function getRecordedSecurityBlocksForTesting(): ReadonlyArray<SecurityBlockRecord> {
	return recordedSecurityBlocks;
}

export function resetSecurityStateForTesting(): void {
	if (process.env.NODE_ENV !== 'test') {
		return;
	}

	memorySuspiciousCounters.clear();
	memorySecurityBlocks.clear();
	recordedSecurityEvents.length = 0;
	recordedSecurityBlocks.length = 0;
	nextRecordedEventId = 1;
	nextMemoryBlockId = 1;
}
