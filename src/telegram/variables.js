import * as dotenv from 'dotenv';

dotenv.config();

export const TELEGRAM_BOT_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
export const TELEGRAM_FILE_URL = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}`;
