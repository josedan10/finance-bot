import axios from 'axios';
import { TELEGRAM_BOT_URL, TELEGRAM_FILE_URL } from '../../src/telegram/variables.js';

class TelegramBot {
	constructor() {
		this.token = process.env.TELEGRAM_BOT_TOKEN;
		this.url = TELEGRAM_BOT_URL;
	}

	sendRequest(method, data = null, params = {}) {
		return axios.post(`${this.url}/${method}`, data, {
			params,
		});
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

	getFilePath(fileId) {
		return this.sendRequest(
			'getFile',
			{},
			{
				file_id: fileId,
			}
		);
	}

	getFileContent(filePath) {
		return axios.get(`${TELEGRAM_FILE_URL}/${filePath}`);
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
