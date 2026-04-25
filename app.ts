import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import path from 'path';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { RouterApp as indexRouter } from './routes';
import { TaskQueueModuleService } from './modules/crons/task-queue.cron';
import logger from './src/lib/logger';
import { AppError } from './src/lib/appError';
import { config } from './src/config';
import { captureRequestException } from './src/lib/sentry';
import {
	activeSecurityBlockMiddleware,
	blockSuspiciousPathsMiddleware,
	collectSecurityFingerprintWithAuthContext,
	createRateLimitMiddleware,
	securityHeadersMiddleware,
} from './src/lib/request-security';
import { persistNotFoundSecurityEvent } from './src/lib/security-path-blocks';

const app = express();
const runtimePublicDir = path.resolve(process.cwd(), 'public');
const bundledPublicDir = path.join(__dirname, 'public');
const highThroughputReceiptPaths = [
	'/api/ai/receipt-analysis',
	'/api/ai/receipt-analysis/queue',
	'/api/ai/scan-receipt',
	'/api/ai/receipt-samples',
];
const isHighThroughputReceiptPath = (pathValue: string): boolean =>
	highThroughputReceiptPaths.some((prefix) => pathValue === prefix || pathValue.startsWith(`${prefix}/`));
const apiRateLimitMiddleware = createRateLimitMiddleware({
	windowMs: config.API_RATE_LIMIT_WINDOW_MS,
	maxRequests: config.API_RATE_LIMIT_MAX_REQUESTS,
	resolveMaxRequests: (req, defaults) =>
		isHighThroughputReceiptPath(req.path)
			? Math.max(defaults.maxRequests, config.API_RATE_LIMIT_RECEIPT_MAX_REQUESTS)
			: defaults.maxRequests,
	shouldSkipSuspiciousTracking: (req) => isHighThroughputReceiptPath(req.path),
});

const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.set('trust proxy', config.TRUSTED_PROXIES);
app.use(morgan(morganFormat));
app.use(securityHeadersMiddleware);
app.use(activeSecurityBlockMiddleware);
app.use(blockSuspiciousPathsMiddleware);
app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: config.REQUEST_BODY_LIMIT }));
app.use(cookieParser());
app.use(express.static(runtimePublicDir));
app.use(express.static(bundledPublicDir));
app.use((req: Request, res: Response, next: NextFunction) => {
	const incomingRequestId = req.get('x-request-id');
	const requestId = incomingRequestId && incomingRequestId.trim() ? incomingRequestId.trim() : randomUUID();
	res.locals.requestId = requestId;
	res.setHeader('x-request-id', requestId);
	next();
});
app.use(apiRateLimitMiddleware);

app.use('/', indexRouter);

app.use('*', (req: Request, res: Response, next: NextFunction) => {
	collectSecurityFingerprintWithAuthContext(req)
		.then((fingerprint) => persistNotFoundSecurityEvent({
			method: req.method,
			path: req.path,
			statusCode: 404,
			fingerprint,
		}))
		.catch((error) => {
			logger.error('Failed to persist not-found security event', {
				error: error instanceof Error ? error.message : String(error),
				path: req.path,
			});
		});

	next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

type ErrorResponse = Error & {
	statusCode?: number;
	status?: string;
};

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
	const normalizedError: ErrorResponse = err instanceof Error
		? (err as ErrorResponse)
		: (new Error('Unknown error') as ErrorResponse);
	normalizedError.statusCode = normalizedError.statusCode || 500;
	normalizedError.status = normalizedError.status || 'error';

	logger.error('Unhandled error', { error: normalizedError.message, stack: normalizedError.stack });
	captureRequestException(normalizedError, {
		method: req.method,
		url: req.originalUrl,
		requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : undefined,
		statusCode: normalizedError.statusCode,
		query: req.query as Record<string, unknown>,
		body: req.body as Record<string, unknown> | undefined,
		headers: {
			'user-agent': req.get('user-agent') ?? undefined,
			'content-type': req.get('content-type') ?? undefined,
			'content-length': req.get('content-length') ?? undefined,
			origin: req.get('origin') ?? undefined,
			referer: req.get('referer') ?? undefined,
			'x-request-id': typeof res.locals.requestId === 'string' ? res.locals.requestId : undefined,
		},
		user: req.user
			? {
				id: req.user.id,
				email: req.user.email,
				role: req.user.role ?? null,
			}
			: undefined,
	});

	res.status(normalizedError.statusCode).json({
		status: normalizedError.status,
		message: normalizedError.message,
		...(req.app.get('env') === 'development' && { stack: normalizedError.stack }),
	});
});

if (process.env.NODE_ENV !== 'test') {
	TaskQueueModuleService.start();
}

export default app;
