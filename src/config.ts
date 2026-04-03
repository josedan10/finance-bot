import path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables immediately
dotenv.config();

function parseIntegerInRange(value: string | undefined, fallback: number, min: number, max: number): number {
	const parsed = Number.parseInt(value ?? '', 10);

	if (!Number.isFinite(parsed)) {
		return fallback;
	}

	return Math.min(max, Math.max(min, parsed));
}

function parseReceiptTextProvider(value: string | undefined): 'ocr' | 'gemini' {
	const normalized = value?.trim().toLowerCase();
	return normalized === 'gemini' ? 'gemini' : 'ocr';
}

export const config = {
	TEST_CHAT_ID: Number(process.env.TEST_CHAT_ID) || 0,
	CRON_TIMEZONE: process.env.CRON_TIMEZONE || 'America/Caracas',
	PYDOLAR_API_URL: process.env.PYDOLAR_API_URL || 'https://pydolarvenezuela-api.vercel.app/api/v1/dollar',
	IMAGE_2_TEXT_SERVICE_URL: process.env.IMAGE_2_TEXT_SERVICE_URL || 'http://localhost:4000',
	RECEIPT_TEXT_PROVIDER: parseReceiptTextProvider(process.env.RECEIPT_TEXT_PROVIDER),
	GEMINI_RECEIPT_MODEL: process.env.GEMINI_RECEIPT_MODEL || 'gemini-1.5-flash',
	REQUEST_BODY_LIMIT: process.env.REQUEST_BODY_LIMIT || '15mb',
	RECEIPT_UPLOAD_MAX_FILE_SIZE_BYTES: Number(process.env.RECEIPT_UPLOAD_MAX_FILE_SIZE_BYTES) || 10 * 1024 * 1024,
	RECEIPT_BULK_UPLOAD_MAX_FILES: parseIntegerInRange(process.env.RECEIPT_BULK_UPLOAD_MAX_FILES, 10, 1, 100),
	RECEIPT_PROCESSING_TTL_HOURS: Number(process.env.RECEIPT_PROCESSING_TTL_HOURS) || 1,
	RECEIPT_OCR_JPEG_QUALITY: parseIntegerInRange(process.env.RECEIPT_OCR_JPEG_QUALITY, 85, 1, 100),
	RECEIPT_OCR_MIN_JPEG_QUALITY: parseIntegerInRange(process.env.RECEIPT_OCR_MIN_JPEG_QUALITY, 55, 1, 100),
	RECEIPT_OCR_MAX_IMAGE_DIMENSION: parseIntegerInRange(process.env.RECEIPT_OCR_MAX_IMAGE_DIMENSION, 1600, 1, 8000),
	RECEIPT_OCR_TARGET_MAX_BYTES: parseIntegerInRange(
		process.env.RECEIPT_OCR_TARGET_MAX_BYTES,
		300 * 1024,
		32 * 1024,
		10 * 1024 * 1024
	),
	RECEIPT_OCR_JOB_TTL_HOURS: parseIntegerInRange(process.env.RECEIPT_OCR_JOB_TTL_HOURS, 24, 1, 168),
	RECEIPT_OCR_JOB_MAX_ATTEMPTS: parseIntegerInRange(process.env.RECEIPT_OCR_JOB_MAX_ATTEMPTS, 2, 1, 10),
	RECEIPT_OCR_QUEUE_BATCH_SIZE: parseIntegerInRange(process.env.RECEIPT_OCR_QUEUE_BATCH_SIZE, 1, 1, 10),
	RATE_AVAILABLE_START_HOUR: 9,
	RATE_AVAILABLE_END_HOUR: 11,
	MAX_DESCRIPTION_LENGTH: 100,
	MAX_ERROR_MESSAGE_LENGTH: 250,

	GMAIL_CREDENTIALS_PATH: process.env.GMAIL_CREDENTIALS_PATH || path.resolve('./credentials.json'),
	GMAIL_TOKEN_PATH: process.env.GMAIL_TOKEN_PATH || path.resolve('./token.json'),
	GMAIL_POLL_QUERY: process.env.GMAIL_POLL_QUERY || 'is:unread category:updates',
	GMAIL_SCOPES: ['https://www.googleapis.com/auth/gmail.modify'],

	// Web Push Notifications (VAPID)
	VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
	VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
	VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:admin@financebot.com',

	// AI Assistant
	GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '',
	OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
};
