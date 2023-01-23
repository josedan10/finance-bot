describe('>> Google Sheets Module: ', function () {
	test('Get sheet data', async () => {
		const googleSheetsModule = require('./google-sheets.module.js');
		await googleSheetsModule.authorize();
		const data = await googleSheetsModule.getSheetData();
		expect(data).toBeDefined();
	});

	test('Authorize app', async () => {
		const googleSheetsModule = require('./google-sheets.module.js');
		const response = googleSheetsModule.authorize();
		await expect(response).resolves.toBeDefined();
	});
});
