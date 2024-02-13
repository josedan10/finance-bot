import axios from 'axios';
import { TELEGRAM_BOT_URL, TELEGRAM_FILE_URL } from '../../src/telegram/variables.js';
import FormData from 'form-data';
import fs from 'fs';

class TelegramBot {
	constructor() {
		this.token = process.env.TELEGRAM_BOT_TOKEN;
		this.url = TELEGRAM_BOT_URL;
	}

	sendRequest(method, data = null, params = {}, headers = {}) {
		return axios.post(`${this.url}/${method}`, data, {
			params,
			headers,
		});
	}

	sendMessage(message, chatId) {
		return this.sendRequest('sendMessage', {
			text: message,
			chat_id: chatId,
		});
	}

	sendImage(image, caption, chatId) {
		try {
			const formData = new FormData();
			const stream = fs.createReadStream(image);
			formData.append('photo', stream, { filename: caption });

			if (!chatId) throw new Error('No chat ID provided');

			return this.sendRequest(
				'sendPhoto',
				formData,
				{ chat_id: chatId },
				{
					'Content-Type': 'multipart/form-data',
				}
			);
		} catch (error) {
			console.error('Error sending image', error);
		}
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

	getFileContent(filePath, config = {}) {
		return axios.get(`${TELEGRAM_FILE_URL}/${filePath}`, config);
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
