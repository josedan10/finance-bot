/**
 * One-time script to authenticate with Gmail OAuth2.
 *
 * Usage: npx ts-node scripts/gmail-auth.ts
 *
 * Prerequisites:
 *   1. Create a Google Cloud project at https://console.cloud.google.com/
 *   2. Enable the Gmail API
 *   3. Create OAuth 2.0 credentials (Desktop app type)
 *   4. Download the JSON and save as ./credentials.json
 *
 * This script will open a browser for consent and save token.json
 * for subsequent API calls.
 */

import { authenticate } from '@google-cloud/local-auth';
import fs from 'fs';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const CREDENTIALS_PATH = path.resolve(process.env.GMAIL_CREDENTIALS_PATH || './credentials.json');
const TOKEN_PATH = path.resolve(process.env.GMAIL_TOKEN_PATH || './token.json');

async function main() {
	console.log('Gmail OAuth2 Setup');
	console.log('==================\n');

	if (!fs.existsSync(CREDENTIALS_PATH)) {
		console.error(`Error: credentials file not found at ${CREDENTIALS_PATH}`);
		console.error('\nTo set up Gmail integration:');
		console.error('  1. Go to https://console.cloud.google.com/');
		console.error('  2. Create a project (or select an existing one)');
		console.error('  3. Enable the Gmail API under "APIs & Services > Library"');
		console.error('  4. Go to "APIs & Services > Credentials"');
		console.error('  5. Create an OAuth 2.0 Client ID (type: Desktop app)');
		console.error('  6. Download the JSON and save it as ./credentials.json');
		process.exit(1);
	}

	if (fs.existsSync(TOKEN_PATH)) {
		console.log(`Token already exists at ${TOKEN_PATH}`);
		console.log('Delete it and re-run this script to re-authenticate.\n');
		process.exit(0);
	}

	console.log('Opening browser for Google OAuth consent...\n');

	const client = await authenticate({
		scopes: SCOPES,
		keyfilePath: CREDENTIALS_PATH,
	});

	if (!client.credentials.refresh_token) {
		console.error('Error: No refresh token received. Try deleting the token and re-authenticating.');
		process.exit(1);
	}

	const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
	const keys = JSON.parse(content);
	const key = keys.installed || keys.web;

	const payload = JSON.stringify(
		{
			type: 'authorized_user',
			client_id: key.client_id,
			client_secret: key.client_secret,
			refresh_token: client.credentials.refresh_token,
		},
		null,
		2
	);

	fs.writeFileSync(TOKEN_PATH, payload);

	console.log(`\nToken saved to ${TOKEN_PATH}`);
	console.log('Gmail integration is ready! The bot will now be able to read your emails.');
}

main().catch((error) => {
	console.error('Authentication failed:', error.message);
	process.exit(1);
});
