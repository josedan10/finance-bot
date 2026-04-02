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
		integrations: [nodeProfilingIntegration()],
		tracesSampleRate: Number.isFinite(traceSampleRate) ? traceSampleRate : 0,
		profilesSampleRate: Number.isFinite(profileSampleRate) ? profileSampleRate : 0,
		sendDefaultPii: false,
	});
}

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
		user?: SentryUser;
	}
) => {
	if (!isSentryEnabled) {
		return;
	}

	Sentry.withScope((scope) => {
		scope.setTag('http.method', requestContext.method);
		scope.setExtra('url', requestContext.url);

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
