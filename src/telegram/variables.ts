import * as dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const RESOLVED_TELEGRAM_BOT_TOKEN = TELEGRAM_BOT_TOKEN || (process.env.NODE_ENV === 'test' ? 'test-token' : '');

export const HAS_TELEGRAM_BOT_TOKEN = Boolean(RESOLVED_TELEGRAM_BOT_TOKEN);
export const TELEGRAM_BOT_URL = `https://api.telegram.org/bot${RESOLVED_TELEGRAM_BOT_TOKEN}`;
export const TELEGRAM_FILE_URL = `https://api.telegram.org/file/bot${RESOLVED_TELEGRAM_BOT_TOKEN}`;
