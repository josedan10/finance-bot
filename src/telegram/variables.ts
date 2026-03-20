import * as dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

export const HAS_TELEGRAM_BOT_TOKEN = Boolean(TELEGRAM_BOT_TOKEN);
export const TELEGRAM_BOT_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
export const TELEGRAM_FILE_URL = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}`;
