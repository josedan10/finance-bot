import * as dotenv from 'dotenv';

dotenv.config();

export const TELEGRAM_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
