import commandsModule from '../../modules/commands/commands.module.js';
import telegramBot from '../../modules/telegram/telegram.module.js';
import { TELEGRAM_FILE_URL } from '../../src/telegram/variables.js';

export async function setCommands(req, res) {
	const commands = commandsModule.getCommandsArray();

	const response = await telegramBot.sendRequest('setMyCommands', commands);
	console.log(response.data);
	res.send('Commands set');
}

export async function setWebhook(req, res) {
	const { url } = req.body;
	await telegramBot.setWebhook(`${url}/telegram/webhook`);
	res.send('Webhook set');
}

export async function sendMessage(req, res) {
	const { chatId, message } = req.body;
	await telegramBot.sendMessage(message, chatId);
	res.send('Message sent');
}

export async function getMe(req, res) {
	const response = await telegramBot.sendRequest('getMe');
	res.send(JSON.stringify(response.data));
}

export async function webhookHandler(req, res) {
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

				// Split the array on the middle and get the second half
				// The second half contains the images with the highest resolution
				const half = Math.ceil(photos.length / 2);
				const highestRes = photos.slice(half);

				for (const photo of highestRes) {
					const filePath = await telegramBot.getFilePath(photo.file_id);
					imagesUrls.push(`${TELEGRAM_FILE_URL}/${filePath.data.result.file_path}`);
				}
				// Call image recognition service
				commandResponse = await commandsModule.executeCommand(command.commandName, imagesUrls);
				console.log(commandResponse);
				return;
			} else {
				const filePath = await telegramBot.getFilePath(req.body.message.document.file_id);
				const fileContent = await telegramBot.getFileContent(filePath.data.result.file_path);
				commandResponse = await commandsModule.executeCommand(command.commandName, fileContent.data);
			}

			telegramBot.sendMessage(commandResponse, req.body.message.chat.id);
			res.send('ok');
			return;
		}
		telegramBot.sendMessage("I don't understand you", req.body.message.chat.id);
		res.send("I don't understand you");
	} catch (error) {
		console.debug(error);
		telegramBot.sendMessage(error.message?.slice(0, 250), req.body.message.chat.id);
		res.status(200);
		res.send(error.message);
	}
}
