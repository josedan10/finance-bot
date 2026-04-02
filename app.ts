import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { RouterApp as indexRouter } from './routes';
import { TaskQueueModuleService } from './modules/crons/task-queue.cron';
import logger from './src/lib/logger';
import { AppError } from './src/lib/appError';
import { captureRequestException } from './src/lib/sentry';

const app = express();

const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);

app.use('*', (req: Request, res: Response, next: NextFunction) => {
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
