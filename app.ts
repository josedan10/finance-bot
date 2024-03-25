import createError from 'http-errors';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import * as dotenv from 'dotenv';
import { RouterApp as indexRouter } from './routes';
import { TaskQueueModuleService } from './modules/crons/task-queue.cron';

dotenv.config();

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(logger('combined'));

app.use('/', indexRouter);

app.use('*', (req: Request, res: Response) => {
	res.status(404).send("Sorry, can't find that!");
});

// catch 404 and forward to error handler
app.use((req: Request, res: Response, next: NextFunction) => {
	next(createError(404));
});

// error handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, req: Request, res: Response) => {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get('env') === 'development' ? err : {};

	// render the error page
	res.status(err.status || 500);
	res.send('An error occurred!');

	console.error(err);
});

TaskQueueModuleService.start();

export default app;
