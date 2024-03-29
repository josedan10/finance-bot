import commandsModule from '../../modules/commands/commands.module';
import telegramBot from '../../modules/telegram/telegram.module';
import { TELEGRAM_FILE_URL } from '../../src/telegram/variables';
import { Request, Response } from 'express';

export async function setCommands(req: Request, res: Response): Promise<void> {
	const commands = commandsModule.getCommandsArray();
	const response = await telegramBot.sendRequest('setMyCommands', commands);
	console.log(response.data);
	res.send('Commands set');
}

export async function setWebhook(req: Request, res: Response): Promise<void> {
	const { url } = req.body;
	await telegramBot.setWebhook(`${url}/telegram/webhook`);
	res.send('Webhook set');
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
	const { chatId, message } = req.body;
	await telegramBot.sendMessage(message, chatId);
	res.send('Message sent');
}

export async function getMe(req: Request, res: Response): Promise<void> {
	const response = await telegramBot.sendRequest('getMe');
	res.send(JSON.stringify(response.data));
}

// TODO: refactor this function. Extract the domain logic outside of the controller.
export async function webhookHandler(req: Request, res: Response): Promise<void> {
	try {
		let commandResponse;
		let command;

		if (req?.body?.message?.text?.[0] === '/') {
			command = telegramBot.commandParser(req.body.message.text);
			commandResponse = await commandsModule.executeCommand(command.commandName, command.commandArgs);
			telegramBot.sendMessage(commandResponse, req.body.message.chat.id);
			res.send('ok');
			return;
		}

		if (req?.body?.message?.caption?.[0] === '/') {
			command = telegramBot.commandParser(req.body.message.caption);

			if (command.commandName === commandsModule.commandsList.registerTransaction) {
				console.log('Transaction receipt');
				const photos = req?.body?.message?.photo;

				const imagesUrls = [];

				// Get the higher resolution photo
				const bestPhoto = photos.sort(
					(a: { file_size: number }, b: { file_size: number }) => b.file_size - a.file_size
				)[0];

				const filePath = await telegramBot.getFilePath(bestPhoto.file_id);
				const fileUrl = `${TELEGRAM_FILE_URL}/${filePath?.data.result.file_path}`;
				imagesUrls.push(fileUrl);

				// Call image recognition service
				commandResponse = await commandsModule.executeCommand(command.commandName, {
					images: imagesUrls,
					telegramFileIds: [bestPhoto.file_id],
					commandArgs: command.commandArgs,
				});
			} else {
				const filePath = await telegramBot.getFilePath(req.body.message.document.file_id);
				const fileContent = await telegramBot.getFileContent(filePath?.data.result.file_path);
				commandResponse = await commandsModule.executeCommand(command.commandName, fileContent?.data);
			}

			telegramBot.sendMessage(commandResponse, req.body.message.chat.id);
			res.send('ok');
			return;
		}
		telegramBot.sendMessage("I don't understand you", req.body.message.chat.id);
		res.send("I don't understand you");
	} catch (error: unknown) {
		const errorResponse = error as Error;
		console.debug(error);
		telegramBot.sendMessage(errorResponse.message?.slice(0, 250), req.body.message.chat.id);
		res.status(200);
		res.send(errorResponse.message);
	}
}
