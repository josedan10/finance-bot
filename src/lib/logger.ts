import winston from 'winston';

const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || 'info',
	format: winston.format.combine(
		winston.format.timestamp(),
		process.env.NODE_ENV === 'production'
			? winston.format.json()
			: winston.format.combine(winston.format.colorize(), winston.format.simple())
	),
	defaultMeta: { service: 'finance-bot' },
	transports: [new winston.transports.Console()],
});

export default logger;
