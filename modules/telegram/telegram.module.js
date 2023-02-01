import axios from 'axios';
import { TELEGRAM_URL } from '../../src/telegram/variables.js';

class TelegramBot {
	constructor() {
		this.token = process.env.TELEGRAM_BOT_TOKEN;
		this.url = TELEGRAM_URL;
	}

	sendRequest(method, data = null) {
		return axios.post(`${this.url}/${method}`, data);
	}

	sendMessage(message, chatId) {
		return this.sendRequest('sendMessage', {
			text: message,
			chat_id: chatId,
		});
	}

	setWebhook(url) {
		return this.sendRequest('setWebhook', {
			url,
		});
	}

	commandParser(command) {
		const commandArray = command.split(' ');
		const commandName = commandArray[0].substring(1);
		const commandArgs = commandArray.slice(1);
		return {
			commandName,
			commandArgs,
		};
	}
}

export default new TelegramBot();
