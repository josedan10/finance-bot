import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import * as dotenv from 'dotenv';
import { RouterApp as indexRouter } from './routes';
import { TaskQueueModuleService } from './modules/crons/task-queue.cron';
import logger from './src/lib/logger';

dotenv.config();

const app = express();

const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);

app.use('*', (req: Request, res: Response) => {
	res.status(404).send("Sorry, can't find that!");
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
	res.locals.message = err.message;
	res.locals.error = req.app.get('env') === 'development' ? err : {};

	res.status(err.status || 500);
	res.send('An error occurred!');

	logger.error('Unhandled error', { error: err.message, stack: err.stack });
});

if (process.env.NODE_ENV !== 'test') {
	TaskQueueModuleService.start();
}

export default app;
