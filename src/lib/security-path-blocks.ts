import { Prisma } from '@prisma/client';
import { PrismaModule as prisma } from '../../modules/database/database.module';
import { persistSecurityEvent } from './security-events';

export type SecurityPathBlockMatchType = 'exact' | 'prefix';

export type SecurityPathBlockRecord = {
	id: number;
	createdAt: string;
	updatedAt: string;
	path: string;
	normalizedPath: string;
	matchType: SecurityPathBlockMatchType;
	reason: string | null;
	active: boolean;
	removedAt: string | null;
	removedBy: number | null;
	metadataJson?: Prisma.JsonValue | null;
};

export type SecurityPathBlockQueryInput = {
	active?: boolean;
	path?: string;
	page?: number;
	pageSize?: number;
};

export type SecurityPathBlockMatchResult = {
	blocked: boolean;
	pathBlockId: number | null;
	normalizedPath?: string;
};

type PaginatedSecurityResult<T> = {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
};

const memoryPathBlocks: SecurityPathBlockRecord[] = [];
let nextMemoryPathBlockId = 1;

export function normalizeSecurityPath(input: string): string {
	const trimmed = (input || '').trim();
	if (!trimmed) {
		return '/';
	}

	const withoutQuery = trimmed.split('?')[0] ?? trimmed;
	const withoutFragment = withoutQuery.split('#')[0] ?? withoutQuery;
	const withSlash = withoutFragment.startsWith('/') ? withoutFragment : `/${withoutFragment}`;
	const collapsed = withSlash.replace(/\/{2,}/g, '/');
	const normalized = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;

	try {
		return decodeURIComponent(normalized).toLowerCase();
	} catch {
		return normalized.toLowerCase();
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

function normalizeMatchType(value?: string): SecurityPathBlockMatchType {
	return value === 'prefix' ? 'prefix' : 'exact';
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

function sortByUpdatedAtDesc<T extends { updatedAt: string }>(items: T[]): T[] {
	return [...items].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function mapPathBlockRecord(block: {
	id: number;
	createdAt: Date;
	updatedAt: Date;
	path: string;
	normalizedPath: string;
	matchType: string;
	reason: string | null;
	active: boolean;
	removedAt: Date | null;
	removedBy: number | null;
	metadataJson: Prisma.JsonValue | null;
}): SecurityPathBlockRecord {
	return {
		id: block.id,
		createdAt: block.createdAt.toISOString(),
		updatedAt: block.updatedAt.toISOString(),
		path: block.path,
		normalizedPath: block.normalizedPath,
		matchType: normalizeMatchType(block.matchType),
		reason: block.reason,
		active: block.active,
		removedAt: block.removedAt?.toISOString() ?? null,
		removedBy: block.removedBy ?? null,
		metadataJson: block.metadataJson,
	};
}

function pathBlockMatches(block: Pick<SecurityPathBlockRecord, 'active' | 'removedAt' | 'normalizedPath' | 'matchType'>, normalizedPath: string): boolean {
	if (!block.active || Boolean(block.removedAt)) {
		return false;
	}

	if (block.matchType === 'prefix') {
		return normalizedPath.startsWith(block.normalizedPath);
	}

	return block.normalizedPath === normalizedPath;
}

export async function matchActiveSecurityPathBlock(path: string): Promise<SecurityPathBlockMatchResult> {
	const normalizedPath = normalizeSecurityPath(path);

	if (process.env.NODE_ENV === 'test') {
		const existing = sortByUpdatedAtDesc(memoryPathBlocks).find((block) => pathBlockMatches(block, normalizedPath));
		if (!existing) {
			return { blocked: false, pathBlockId: null, normalizedPath };
		}
		return { blocked: true, pathBlockId: existing.id, normalizedPath };
	}

	const blocks = await prisma.securityPathBlock.findMany({
		where: {
			active: true,
			removedAt: null,
		},
		orderBy: [
			{ matchType: 'desc' },
			{ updatedAt: 'desc' },
		],
	});

	const existing = blocks.find((block) => {
		const normalizedMatchType = normalizeMatchType(block.matchType);
		if (normalizedMatchType === 'prefix') {
			return normalizedPath.startsWith(block.normalizedPath);
		}
		return block.normalizedPath === normalizedPath;
	});

	if (!existing) {
		return { blocked: false, pathBlockId: null, normalizedPath };
	}

	return {
		blocked: true,
		pathBlockId: existing.id,
		normalizedPath,
	};
}

export async function listSecurityPathBlocks(
	filters: SecurityPathBlockQueryInput = {}
): Promise<PaginatedSecurityResult<SecurityPathBlockRecord>> {
	if (process.env.NODE_ENV === 'test') {
		const pathFilter = filters.path?.trim().toLowerCase();
		const filtered = sortByUpdatedAtDesc(
			memoryPathBlocks.filter((block) => {
				if (typeof filters.active === 'boolean' && block.active !== filters.active) {
					return false;
				}
				if (pathFilter && !block.path.toLowerCase().includes(pathFilter)) {
					return false;
				}
				return true;
			})
		);
		return paginate(filtered, filters.page, filters.pageSize);
	}

	const page = normalizePage(filters.page);
	const pageSize = normalizePageSize(filters.pageSize);
	const where: Prisma.SecurityPathBlockWhereInput = {
		...(typeof filters.active === 'boolean' ? { active: filters.active } : {}),
		...(filters.path
			? {
				path: {
					contains: filters.path,
				},
			}
			: {}),
	};

	const [items, total] = await Promise.all([
		prisma.securityPathBlock.findMany({
			where,
			orderBy: {
				updatedAt: 'desc',
			},
			skip: (page - 1) * pageSize,
			take: pageSize,
		}),
		prisma.securityPathBlock.count({ where }),
	]);

	return {
		items: items.map(mapPathBlockRecord),
		total,
		page,
		pageSize,
		totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
	};
}

export async function createSecurityPathBlock(input: {
	path: string;
	matchType?: SecurityPathBlockMatchType;
	reason?: string;
	actorUserId?: number | null;
}): Promise<SecurityPathBlockRecord> {
	const normalizedPath = normalizeSecurityPath(input.path);
	const matchType = normalizeMatchType(input.matchType);
	const reason = input.reason?.trim() || 'Manual blocked path';
	const metadataJson = {
		actorUserId: input.actorUserId ?? null,
		matchType,
	} as Prisma.JsonValue;

	if (process.env.NODE_ENV === 'test') {
		const existing = memoryPathBlocks.find(
			(block) => block.normalizedPath === normalizedPath && block.matchType === matchType
		);
		if (existing) {
			existing.path = input.path.trim() || normalizedPath;
			existing.matchType = matchType;
			existing.reason = reason;
			existing.active = true;
			existing.removedAt = null;
			existing.removedBy = null;
			existing.updatedAt = new Date().toISOString();
			existing.metadataJson = metadataJson;
			return existing;
		}

		const nowIso = new Date().toISOString();
		const created: SecurityPathBlockRecord = {
			id: nextMemoryPathBlockId,
			createdAt: nowIso,
			updatedAt: nowIso,
			path: input.path.trim() || normalizedPath,
			normalizedPath,
			matchType,
			reason,
			active: true,
			removedAt: null,
			removedBy: null,
			metadataJson,
		};
		nextMemoryPathBlockId += 1;
		memoryPathBlocks.push(created);
		return created;
	}

	const upserted = await prisma.securityPathBlock.upsert({
		where: {
			normalizedPath_matchType: {
				normalizedPath,
				matchType,
			},
		},
		update: {
			path: input.path.trim() || normalizedPath,
			matchType,
			reason,
			active: true,
			removedAt: null,
			removedBy: null,
			metadataJson: metadataJson as Prisma.InputJsonValue,
		},
		create: {
			path: input.path.trim() || normalizedPath,
			normalizedPath,
			matchType,
			reason,
			active: true,
			metadataJson: metadataJson as Prisma.InputJsonValue,
		},
	});

	return mapPathBlockRecord(upserted);
}

export async function removeSecurityPathBlock(
	blockId: number,
	actorUserId?: number | null
): Promise<SecurityPathBlockRecord | null> {
	if (process.env.NODE_ENV === 'test') {
		const existing = memoryPathBlocks.find((block) => block.id === blockId);
		if (!existing) {
			return null;
		}

		existing.active = false;
		existing.removedAt = new Date().toISOString();
		existing.updatedAt = existing.removedAt;
		existing.removedBy = actorUserId ?? null;
		return existing;
	}

	const existing = await prisma.securityPathBlock.findUnique({
		where: {
			id: blockId,
		},
	});

	if (!existing) {
		return null;
	}

	const removedAt = new Date();
	const updated = await prisma.securityPathBlock.update({
		where: {
			id: blockId,
		},
		data: {
			active: false,
			removedAt,
			removedBy: actorUserId ?? null,
		},
	});

	return mapPathBlockRecord(updated);
}

export async function persistNotFoundSecurityEvent(input: {
	method: string;
	path: string;
	statusCode: number;
	fingerprint: {
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
	};
}): Promise<void> {
	await persistSecurityEvent({
		kind: 'not_found',
		action: 'not_found',
		method: input.method,
		path: input.path,
		statusCode: input.statusCode,
		matchedRule: 'unmatched-route',
		fingerprint: input.fingerprint,
	});
}

export function resetSecurityPathBlocksForTesting(): void {
	if (process.env.NODE_ENV !== 'test') {
		return;
	}

	memoryPathBlocks.length = 0;
	nextMemoryPathBlockId = 1;
}
