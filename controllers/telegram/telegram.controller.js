const commandsModule = require('../../modules/commands/commands.module.js');
const telegramBot = require('../../modules/telegram/telegram.module.js');

async function setWebhook(req, res) {
	const { url } = req.body;
	await telegramBot.setWebhook(`${url}/telegram/webhook`);
	res.send('Webhook set');
}

async function sendMessage(req, res) {
	const { chatId, message } = req.body;
	await telegramBot.sendMessage(message, chatId);
	res.send('Message sent');
}

async function getMe(req, res) {
	const response = await telegramBot.sendRequest('getMe');
	res.send(JSON.stringify(response.data));
}

async function webhookHandler(req, res) {
	try {
		if (req?.body?.message?.text[0] === '/') {
			const command = telegramBot.commandParser(req.body.message.text);
			await commandsModule.executeCommand(command.commandName, command.commandArgs);
			telegramBot.sendMessage('Registered transaction', req.body.message.chat.id);
			res.send('ok');
			return;
		}
		telegramBot.sendMessage("I don't understand you", req.body.message.chat.id);
		res.send("I don't understand you");
	} catch (error) {
		telegramBot.sendMessage(error.message, req.body.message.chat.id);
		res.status(500);
		res.send(error.message);
	}
}

module.exports = {
	setWebhook,
	sendMessage,
	getMe,
	webhookHandler,
};
