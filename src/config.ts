import path from 'path';

export const config = {
	TEST_CHAT_ID: Number(process.env.TEST_CHAT_ID) || (() => { throw new Error('TEST_CHAT_ID environment variable is required'); })(),
	CRON_TIMEZONE: process.env.CRON_TIMEZONE || 'America/Caracas',
	PYDOLAR_API_URL: process.env.PYDOLAR_API_URL || 'https://pydolarvenezuela-api.vercel.app/api/v1/dollar',
	IMAGE_2_TEXT_SERVICE_URL: process.env.IMAGE_2_TEXT_SERVICE_URL || 'http://localhost:4000',
	RATE_AVAILABLE_START_HOUR: 9,
	RATE_AVAILABLE_END_HOUR: 11,
	MAX_DESCRIPTION_LENGTH: 100,
	MAX_ERROR_MESSAGE_LENGTH: 250,

	GMAIL_CREDENTIALS_PATH: process.env.GMAIL_CREDENTIALS_PATH || path.resolve('./credentials.json'),
	GMAIL_TOKEN_PATH: process.env.GMAIL_TOKEN_PATH || path.resolve('./token.json'),
	GMAIL_POLL_QUERY: process.env.GMAIL_POLL_QUERY || 'is:unread category:updates',
	GMAIL_SCOPES: ['https://www.googleapis.com/auth/gmail.modify'],
};
