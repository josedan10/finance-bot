const fs = require('fs').promises;
const path = require('path');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

class GoogleSheetsModule {
	constructor() {
		this.credentials = null;
		this.tokenPath = path.join(__dirname, `../../token.json`);
		this.credentialsPath = path.resolve(__dirname, '../../client_secret.json');
		this.client = null;
	}

	async loadSavedCredentialsIfExist() {
		try {
			const content = await fs.readFile(this.tokenPath);
			const credentials = JSON.parse(content);
			console.log('Credentials loaded from file');
			return google.auth.fromJSON(credentials);
		} catch (err) {
			return null;
		}
	}

	/**
	 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
	 *
	 * @param {OAuth2Client} client
	 * @return {Promise<void>}
	 */
	async saveCredentials(client) {
		const content = await fs.readFile(this.credentialsPath);
		const keys = JSON.parse(content);
		const key = keys.installed || keys.web;
		const payload = JSON.stringify({
			type: 'authorized_user',
			client_id: key.client_id,
			client_secret: key.client_secret,
			refresh_token: client.credentials.refresh_token,
		});
		await fs.writeFile(this.tokenPath, payload);
	}

	/**
	 * Load or request or authorization to call APIs.
	 *
	 */
	async authorize() {
		let client = await this.loadSavedCredentialsIfExist();
		if (client) {
			this.client = client;
			return client;
		}
		client = await authenticate({
			scopes: SCOPES,
			keyfilePath: this.credentialsPath,
		});
		if (client.credentials) {
			await this.saveCredentials(client);
		}
		this.client = client;
		return client;
	}

	/**
	 * Prints the names and majors of students in a sample spreadsheet:
	 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
	 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
	 */
	async getSheetData() {
		const sheets = google.sheets({ version: 'v4', auth: this.client });
		const res = await sheets.spreadsheets.values.get({
			spreadsheetId: '1FbfK3VyRwXhqo34zk6YXpjXju4J7fM7l0YWj4wzq-5Q',
			range: 'Oct 2022!A2:K',
		});
		const rows = res.data.values;
		if (!rows || rows.length === 0) {
			console.log('No data found.');
			return;
		}

		return rows;
		// rows.forEach((row) => {
		//   // Print columns A and E, which correspond to indices 0 and 4.
		//   console.log(row);
		// });
	}
}

module.exports = new GoogleSheetsModule();
