import commandsModule from '../../modules/commands/commands.module';
import telegramBot from '../../modules/telegram/telegram.module';
import { TELEGRAM_FILE_URL } from '../../src/telegram/variables';
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

		let commandResponse;
		let command;

		if (req.body.message.text?.[0] === '/') {
			command = telegramBot.commandParser(req.body.message.text);
			commandResponse = await commandsModule.executeCommand(command.commandName, command.commandArgs);
			await telegramBot.sendMessage(commandResponse, chatId);
			res.send('ok');
			return;
		}

		if (req.body.message.caption?.[0] === '/') {
			command = telegramBot.commandParser(req.body.message.caption);

			if (command.commandName === commandsModule.commandsList.registerTransaction) {
				logger.info('Transaction receipt received');
				const photos = req.body.message.photo;

				if (!photos?.length) {
					await telegramBot.sendMessage('No photos found in message', chatId);
					res.send('ok');
					return;
				}

				const bestPhoto = photos.sort(
					(a: { file_size: number }, b: { file_size: number }) => b.file_size - a.file_size
				)[0];

				const filePath = await telegramBot.getFilePath(bestPhoto.file_id);
				const filePathResult = (filePath as { result?: { file_path?: string } })?.result?.file_path;
				const fileUrl = `${TELEGRAM_FILE_URL}/${filePathResult}`;

				commandResponse = await commandsModule.executeCommand(command.commandName, {
					images: [fileUrl],
					telegramFileIds: [bestPhoto.file_id],
					commandArgs: command.commandArgs,
				});
			} else {
				const document = req.body.message.document;
				if (!document?.file_id) {
					await telegramBot.sendMessage('No document found in message', chatId);
					res.send('ok');
					return;
				}
				const filePath = await telegramBot.getFilePath(document.file_id);
				const filePathResult = (filePath as { result?: { file_path?: string } })?.result?.file_path;
				const fileContent = await telegramBot.getFileContent(filePathResult || '');
				commandResponse = await commandsModule.executeCommand(command.commandName, fileContent);
			}

			await telegramBot.sendMessage(commandResponse, chatId);
			res.send('ok');
			return;
		}

		await telegramBot.sendMessage("I don't understand you", chatId);
		res.send("I don't understand you");
	} catch (error: unknown) {
		const errorResponse = error as Error;
		logger.error('Webhook handler error', { error: errorResponse.message, stack: errorResponse.stack });
		const chatId = req.body?.message?.chat?.id;
		if (chatId) {
			await telegramBot.sendMessage(
				`An error occurred: ${errorResponse.message?.slice(0, config.MAX_ERROR_MESSAGE_LENGTH)}`,
				chatId
			);
		}
		res.status(200).send(errorResponse.message);
	}
}
