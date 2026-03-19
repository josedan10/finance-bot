import { google, gmail_v1 as gmailV1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';

export interface GmailEmail {
	messageId: string;
	from: string;
	subject: string;
	body: string;
	date: Date;
}

class GmailModule {
	private auth: OAuth2Client | null = null;

	private get credentialsPath(): string {
		return path.resolve(config.GMAIL_CREDENTIALS_PATH);
	}

	private get tokenPath(): string {
		return path.resolve(config.GMAIL_TOKEN_PATH);
	}

	private async loadSavedCredentials(): Promise<OAuth2Client | null> {
		try {
			if (!fs.existsSync(this.tokenPath)) return null;
			const content = fs.readFileSync(this.tokenPath, 'utf-8');
			const credentials = JSON.parse(content);
			return google.auth.fromJSON(credentials) as OAuth2Client;
		} catch {
			return null;
		}
	}

	async authorize(): Promise<OAuth2Client> {
		if (this.auth) return this.auth;

		let client = await this.loadSavedCredentials();
		if (client) {
			this.auth = client;
			return client;
		}

		if (!fs.existsSync(this.credentialsPath) || !fs.existsSync(this.tokenPath)) {
			throw new Error(
				`Gmail OAuth credentials or token are missing. Run "npm run gmail:auth" to generate ${this.tokenPath} before starting the service.`
			);
		}

		client = await this.loadSavedCredentials();
		if (!client) {
			throw new Error(
				`Gmail token at ${this.tokenPath} could not be loaded. Re-run "npm run gmail:auth" to refresh the saved credentials.`
			);
		}

		this.auth = client;
		return client;
	}

	private getGmailClient(auth: OAuth2Client): gmailV1.Gmail {
		return google.gmail({ version: 'v1', auth });
	}

	private decodeBase64Url(data: string): string {
		return Buffer.from(data, 'base64url').toString('utf-8');
	}

	private extractBody(payload: gmailV1.Schema$MessagePart): string {
		if (payload.body?.data) {
			return this.decodeBase64Url(payload.body.data);
		}

		if (payload.parts) {
			const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
			if (textPart?.body?.data) {
				return this.decodeBase64Url(textPart.body.data);
			}

			const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
			if (htmlPart?.body?.data) {
				const html = this.decodeBase64Url(htmlPart.body.data);
				return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
			}

			for (const part of payload.parts) {
				if (part.parts) {
					const nested = this.extractBody(part);
					if (nested) return nested;
				}
			}
		}

		return '';
	}

	private getHeader(headers: gmailV1.Schema$MessagePartHeader[] | undefined, name: string): string {
		return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
	}

	async getUnreadEmails(query?: string): Promise<GmailEmail[]> {
		const auth = await this.authorize();
		const gmail = this.getGmailClient(auth);
		const searchQuery = query || config.GMAIL_POLL_QUERY;

		const listResponse = await gmail.users.messages.list({
			userId: 'me',
			q: searchQuery,
			maxResults: 20,
		});

		const messageIds = listResponse.data.messages || [];
		if (messageIds.length === 0) {
			logger.info('No unread emails found matching query', { query: searchQuery });
			return [];
		}

		const emails: GmailEmail[] = [];

		for (const msg of messageIds) {
			if (!msg.id) continue;

			try {
				const detail = await gmail.users.messages.get({
					userId: 'me',
					id: msg.id,
					format: 'full',
				});

				const payload = detail.data.payload;
				if (!payload) continue;

				const from = this.getHeader(payload.headers, 'From');
				const subject = this.getHeader(payload.headers, 'Subject');
				const dateStr = this.getHeader(payload.headers, 'Date');
				const body = this.extractBody(payload);

				emails.push({
					messageId: msg.id,
					from,
					subject,
					body,
					date: dateStr ? new Date(dateStr) : new Date(),
				});
			} catch (error) {
				logger.error('Error fetching email detail', { messageId: msg.id, error });
			}
		}

		logger.info(`Fetched ${emails.length} unread emails`);
		return emails;
	}

	async markAsRead(messageId: string): Promise<void> {
		const auth = await this.authorize();
		const gmail = this.getGmailClient(auth);

		await gmail.users.messages.modify({
			userId: 'me',
			id: messageId,
			requestBody: {
				removeLabelIds: ['UNREAD'],
			},
		});
	}
}

export const GmailService = new GmailModule();
