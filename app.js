import createError from 'http-errors';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import * as dotenv from 'dotenv';
import indexRouter from './routes/index.js';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(logger('combined'));

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	next(createError(404));
});
// error handler
app.use(function (err, req, res, next) {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get('env') === 'development' ? err : {};

	// render the error page
	res.status(err.status || 500);
	res.send('An error occurred!');

	console.error(err);
});

// Runs every day at 9:00 AM America/Caracas during weekdays
cron.schedule(
	'0 9 * * 1-5',
	() => {
		// Hits the local scraper endpoint
		fetch(`http://localhost:${process.env.PORT}/data-enrichment/daily-price-update-by-monitor`);
	},
	{
		timezone: 'America/Caracas',
	}
);

export default app;
