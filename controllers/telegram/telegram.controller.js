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
	console.log(req.body);
	res.send('ok');
}

module.exports = {
	setWebhook,
	sendMessage,
	getMe,
	webhookHandler,
};
