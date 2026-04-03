import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN;
const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const release = process.env.SENTRY_RELEASE;

const traceSampleRate = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0');
const profileSampleRate = Number.parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0');

export const isSentryEnabled = Boolean(dsn);

if (isSentryEnabled) {
	Sentry.init({
		dsn,
		environment,
		release,
		enableLogs: true,
		integrations: [nodeProfilingIntegration(), Sentry.consoleLoggingIntegration({ levels: ['log', 'info', 'warn', 'error'] })],
		tracesSampleRate: Number.isFinite(traceSampleRate) ? traceSampleRate : 0,
		profilesSampleRate: Number.isFinite(profileSampleRate) ? profileSampleRate : 0,
		sendDefaultPii: false,
	});
	console.info('[sentry] Backend Sentry initialized', { environment, release: release ?? null });
} else {
	console.warn('[sentry] Backend Sentry disabled: missing SENTRY_DSN');
}

export type SentryLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export const captureLog = (level: SentryLogLevel, message: string, attributes?: Record<string, unknown>) => {
	if (!isSentryEnabled) {
		return;
	}

	const normalizedAttributes = attributes ?? {};

	switch (level) {
		case 'debug':
			Sentry.logger.debug(message, normalizedAttributes);
			break;
		case 'info':
			Sentry.logger.info(message, normalizedAttributes);
			break;
		case 'warn':
			Sentry.logger.warn(message, normalizedAttributes);
			break;
		case 'error':
			Sentry.logger.error(message, normalizedAttributes);
			break;
		case 'fatal':
			Sentry.logger.fatal(message, normalizedAttributes);
			break;
	}
};

export const captureException = (error: unknown, context?: Record<string, unknown>) => {
	if (!isSentryEnabled) {
		return;
	}

	Sentry.withScope((scope) => {
		if (context) {
			Object.entries(context).forEach(([key, value]) => {
				scope.setExtra(key, value);
			});
		}
		Sentry.captureException(error);
	});
};

const redactKeys = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key', 'password', 'token', 'idToken', 'image']);

function sanitizeValue(value: unknown, depth = 0): unknown {
	if (depth > 2) {
		return '[Truncated]';
	}

	if (typeof value === 'string') {
		return value.length > 500 ? `${value.slice(0, 500)}…` : value;
	}

	if (Array.isArray(value)) {
		return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
	}

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).slice(0, 20).map(([key, item]) => [
				key,
				redactKeys.has(key) ? '[Redacted]' : sanitizeValue(item, depth + 1),
			])
		);
	}

	return value;
}

function sanitizeHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!headers) {
		return undefined;
	}

	return Object.fromEntries(
		Object.entries(headers).map(([key, value]) => [
			key,
			redactKeys.has(key.toLowerCase()) ? '[Redacted]' : sanitizeValue(value),
		])
	);
}

type SentryUser = {
	id?: string | number;
	email?: string | null;
	role?: string | null;
};

export const captureRequestException = (
	error: unknown,
	requestContext: {
		method: string;
		url: string;
		requestId?: string;
		statusCode?: number;
		query?: Record<string, unknown>;
		body?: Record<string, unknown>;
		headers?: Record<string, unknown>;
		tags?: Record<string, string>;
		user?: SentryUser;
	}
) => {
	if (!isSentryEnabled) {
		return;
	}

	Sentry.withScope((scope) => {
		scope.setTag('http.method', requestContext.method);
		scope.setTag('http.route', requestContext.url);
		if (requestContext.requestId) {
			scope.setTag('request_id', requestContext.requestId);
			scope.setExtra('requestId', requestContext.requestId);
		}
		scope.setExtra('url', requestContext.url);
		scope.setContext('request', {
			method: requestContext.method,
			url: requestContext.url,
			statusCode: requestContext.statusCode,
			query: sanitizeValue(requestContext.query),
			body: sanitizeValue(requestContext.body),
			headers: sanitizeHeaders(requestContext.headers),
		});

		if (requestContext.tags) {
			Object.entries(requestContext.tags).forEach(([key, value]) => {
				scope.setTag(key, value);
			});
		}

		if (requestContext.user) {
			scope.setUser({
				id: requestContext.user.id ? String(requestContext.user.id) : undefined,
				email: requestContext.user.email ?? undefined,
				role: requestContext.user.role ?? undefined,
			});
		}

		Sentry.captureException(error);
	});
};

export const flushSentry = async (timeout = 2_000) => {
	if (!isSentryEnabled) {
		return true;
	}

	return Sentry.flush(timeout);
};
