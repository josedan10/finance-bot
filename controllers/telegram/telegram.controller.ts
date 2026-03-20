import commandsModule from '../../modules/commands/commands.module';
import telegramBot from '../../modules/telegram/telegram.module';
import { config } from '../../src/config';
import { Request, Response } from 'express';
import logger from '../../src/lib/logger';

export async function setCommands(req: Request, res: Response): Promise<void> {
	const commands = commandsModule.getCommandsArray();
	const response = await telegramBot.sendRequest('setMyCommands', commands as unknown as Record<string, unknown>);
	logger.info('Commands set', { response });
	res.send('Commands set');
}

export async function setWebhook(req: Request, res: Response): Promise<void> {
	const { url } = req.body;
	if (!url || typeof url !== 'string') {
		res.status(400).send('Missing or invalid "url" in request body');
		return;
	}
	await telegramBot.setWebhook(`${url}/telegram/webhook`);
	res.send('Webhook set');
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
	const { chatId, message } = req.body;
	if (!chatId || !message) {
		res.status(400).send('Missing "chatId" or "message" in request body');
		return;
	}
	await telegramBot.sendMessage(message, chatId);
	res.send('Message sent');
}

export async function getMe(req: Request, res: Response): Promise<void> {
	const response = await telegramBot.sendRequest('getMe');
	res.send(JSON.stringify(response));
}

export async function webhookHandler(req: Request, res: Response): Promise<void> {
	try {
		if (!req.body?.message) {
			res.status(200).send('No message in body');
			return;
		}

		const chatId = req.body.message.chat?.id;
		if (!chatId) {
			res.status(200).send('No chat ID');
			return;
		}

		// Acknowledge telegram immediately
		res.status(200).send('ok');

		// Handle asynchronous execution in the service layer
		const { telegramService } = await import('../../src/services/telegram.service');
		telegramService.handleWebhookMessage(chatId, req.body.message).catch(async (error: unknown) => {
			const errorResponse = error as Error;
			logger.error('Webhook service error', { error: errorResponse.message, stack: errorResponse.stack });
			await telegramBot.sendMessage(
				`An error occurred: ${errorResponse.message?.slice(0, config.MAX_ERROR_MESSAGE_LENGTH)}`,
				chatId
			).catch(() => { });
		});

	} catch (error: unknown) {
		const errorResponse = error as Error;
		logger.error('Webhook handler error', { error: errorResponse.message, stack: errorResponse.stack });
		res.status(200).send(errorResponse.message);
	}
}
