#!/usr/bin/env node

import app from '../app';
import debugApp from 'debug';
import http from 'http';
import logger from '../src/lib/logger';
import { captureException, flushSentry } from '../src/lib/sentry';

const debug = debugApp('finance-bot:server');

const port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

const server = http.createServer(app);

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function normalizePort(val: string) {
	const parsedPort = Number.parseInt(val, 10);

	if (Number.isNaN(parsedPort)) {
		return val;
	}

	if (parsedPort >= 0) {
		return parsedPort;
	}

	return false;
}

function onError(error: NodeJS.ErrnoException) {
	if (error.syscall !== 'listen') {
		throw error;
	}

	const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

	switch (error.code) {
		case 'EACCES':
			logger.error(bind + ' requires elevated privileges');
			process.exit(1);
			break;
		case 'EADDRINUSE':
			logger.error(bind + ' is already in use');
			process.exit(1);
			break;
		default:
			throw error;
	}
}

function onListening() {
	const addr = server.address();
	const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr?.port;
	debug('Listening on ' + bind);
}

async function gracefulShutdown(signal: string) {
	logger.info(`Received ${signal}. Shutting down gracefully...`);
	server.close(() => {
		logger.info('HTTP server closed');
		process.exit(0);
	});

	await flushSentry();

	setTimeout(() => {
		logger.error('Forced shutdown after timeout');
		process.exit(1);
	}, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
	logger.error('Unhandled Rejection', { reason });
	captureException(reason, { type: 'unhandledRejection' });
});

process.on('uncaughtException', (error: Error) => {
	logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
	captureException(error, { type: 'uncaughtException' });
	process.exit(1);
});
