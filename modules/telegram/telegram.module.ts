import axios, { AxiosRequestConfig } from 'axios';
import { HAS_TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_URL, TELEGRAM_FILE_URL } from '../../src/telegram/variables';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import logger from '../../src/lib/logger';

interface TelegramResponse {
	ok: boolean;
	result?: Record<string, unknown>;
	[key: string]: unknown;
}

class TelegramBot {
	private url: string;
	private fileUrl: string;

	constructor() {
		this.url = TELEGRAM_BOT_URL;
		this.fileUrl = TELEGRAM_FILE_URL;
	}

	async sendRequest(
		method: string,
		data: Record<string, unknown> | FormData | null = null,
		params: Record<string, unknown> = {},
		headers: Record<string, string> = {}
	): Promise<TelegramResponse> {
		if (!process.env.TELEGRAM_BOT_TOKEN && !HAS_TELEGRAM_BOT_TOKEN) {
			throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
		}

		const config: AxiosRequestConfig = { params, headers };
		const response = await axios.post(`${this.url}/${method}`, data, config);
		return response?.data;
	}

	async sendMessage(message: string, chatId: number): Promise<TelegramResponse | void> {
		try {
			const response = await this.sendRequest('sendMessage', {
				text: message,
				chat_id: chatId,
			});
			return response;
		} catch (error) {
			logger.error('Error sending message', { error });
		}
	}

	async sendImage(image: string, caption: string, chatId: number): Promise<TelegramResponse | void> {
		try {
			const formData = new FormData();
			const stream = fs.createReadStream(image);
			const sanitizedFilename = path.basename(caption).replace(/[^a-zA-Z0-9._-]/g, '_');
			formData.append('photo', stream, { filename: sanitizedFilename });

			if (!chatId) throw new Error('No chat ID provided');

			const response = await this.sendRequest(
				'sendPhoto',
				formData as unknown as Record<string, unknown>,
				{ chat_id: chatId },
				{ 'Content-Type': 'multipart/form-data' }
			);

			return response;
		} catch (error) {
			logger.error('Error sending image', { error });
		}
	}

	async setWebhook(url: string): Promise<TelegramResponse | void> {
		try {
			const response = await this.sendRequest('setWebhook', { url });
			return response;
		} catch (error) {
			logger.error('Error setting webhook', { error });
		}
	}

	async getFilePath(fileId: string): Promise<TelegramResponse | void> {
		try {
			const response = await this.sendRequest('getFile', {}, { file_id: fileId });
			return response;
		} catch (error) {
			logger.error('Error getting file path', { error });
		}
	}

	async getFileContent(filePath: string): Promise<unknown> {
		try {
			const response = await axios.get(`${this.fileUrl}/${filePath}`);
			return response?.data;
		} catch (error) {
			logger.error('Error getting file content', { error });
		}
	}

	commandParser(command: string): { commandName: string; commandArgs: string[] } {
		const commandArray = command.split(' ');
		const commandName = commandArray[0].substring(1);
		const commandArgs = commandArray.slice(1);
		return { commandName, commandArgs };
	}
}

export default new TelegramBot();
