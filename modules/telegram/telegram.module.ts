/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from 'axios';
import { TELEGRAM_BOT_URL, TELEGRAM_FILE_URL } from '../../src/telegram/variables';
import FormData from 'form-data';
import fs from 'fs';

class TelegramBot {
	private token?: string;
	private url: string;
	private fileUrl: string;

	constructor() {
		this.token = process.env.TELEGRAM_BOT_TOKEN;
		this.url = TELEGRAM_BOT_URL;
		this.fileUrl = TELEGRAM_FILE_URL;
	}

	async sendRequest(
		method: string,
		data: any = null,
		params: any = {},
		headers: any = {}
	): Promise<{ [key: string]: any }> {
		const response = await axios.post(`${this.url}/${method}`, data, {
			params,
			headers,
		});

		return response?.data;
	}

	async sendMessage(message: string, chatId: number): Promise<{ [key: string]: any } | void> {
		try {
			const response = await this.sendRequest('sendMessage', {
				text: message,
				chat_id: chatId,
			});
			return response;
		} catch (error) {
			console.error('Error sending message', error);
		}
	}

	async sendImage(image: string, caption: string, chatId: number): Promise<{ [key: string]: any } | void> {
		try {
			const formData = new FormData();
			const stream = fs.createReadStream(image);
			formData.append('photo', stream, { filename: caption });

			if (!chatId) throw new Error('No chat ID provided');

			const response = await this.sendRequest(
				'sendPhoto',
				formData,
				{ chat_id: chatId },
				{
					'Content-Type': 'multipart/form-data',
				}
			);

			console.log('Executed');
			return response;
		} catch (error) {
			console.error('Error sending image', error);
		}
	}

	async setWebhook(url: string): Promise<{ [key: string]: any } | void> {
		try {
			const response = await this.sendRequest('setWebhook', {
				url,
			});
			return response;
		} catch (error) {
			console.error('Error setting webhook', error);
		}
	}

	async getFilePath(fileId: string): Promise<{ [key: string]: any } | void> {
		try {
			const response = await this.sendRequest(
				'getFile',
				{},
				{
					file_id: fileId,
				}
			);
			return response;
		} catch (error) {
			console.error('Error getting file path', error);
		}
	}

	async getFileContent(filePath: string): Promise<{ [key: string]: any } | void> {
		try {
			const response = await axios.get(`${this.fileUrl}/${filePath}`);
			return response?.data;
		} catch (error) {
			console.error('Error getting file content', error);
		}
	}

	commandParser(command: string): { commandName: string; commandArgs: string[] } {
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
