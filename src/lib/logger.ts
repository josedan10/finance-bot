import winston from 'winston';
import { captureLog, SentryLogLevel } from './sentry';

const sentryLogForwardingFormat = winston.format((info) => {
	const sentryLevel = normalizeSentryLogLevel(info.level);
	if (!sentryLevel) {
		return info;
	}

	const { level, message, service, ...attributes } = info;
	const normalizedMessage = typeof message === 'string' ? message : JSON.stringify(message);

	captureLog(sentryLevel, normalizedMessage, {
		logger: service,
		level,
		...attributes,
	});

	return info;
});

function normalizeSentryLogLevel(level: string): SentryLogLevel | null {
	switch (level) {
		case 'error':
			return 'error';
		case 'warn':
			return 'warn';
		case 'debug':
			return 'debug';
		case 'verbose':
		case 'http':
		case 'info':
			return 'info';
		default:
			return null;
	}
}

const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || 'info',
	format: winston.format.combine(
		winston.format.timestamp(),
		sentryLogForwardingFormat(),
		process.env.NODE_ENV === 'production'
			? winston.format.json()
			: winston.format.combine(winston.format.colorize(), winston.format.simple())
	),
	defaultMeta: { service: 'zentra-bot' },
	transports: [new winston.transports.Console()],
});

export default logger;
