import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { RouterApp as indexRouter } from './routes';
import { TaskQueueModuleService } from './modules/crons/task-queue.cron';
import logger from './src/lib/logger';
import { AppError } from './src/lib/appError';

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

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
	err.statusCode = err.statusCode || 500;
	err.status = err.status || 'error';

	logger.error('Unhandled error', { error: err.message, stack: err.stack });

	res.status(err.statusCode).json({
		status: err.status,
		message: err.message,
		...(req.app.get('env') === 'development' && { stack: err.stack }),
	});
});

if (process.env.NODE_ENV !== 'test') {
	TaskQueueModuleService.start();
}

export default app;
