describe('>> Commands Module: ', function () {
	test('Commands initialized', () => {
		const commandsModule = require('./commands.module.js');
		expect(Object.keys(commandsModule.commands)).toHaveLength(2);
	});

	test('Execute command', async () => {
		const commandsModule = require('./commands.module.js');
		const data = await commandsModule.executeCommand('test', 'test');
		expect(data).toBeDefined();
	});

	test('Execute command with error', async () => {
		const commandsModule = require('./commands.module.js');
		await expect(commandsModule.executeCommand('test1', 'test')).rejects.toThrow();
	});

	test('Execute cashTransaction command', async () => {
		const commandsModule = require('./commands.module.js');
		await expect(commandsModule.executeCommand('cashTransaction', 'test')).toBeDefined();
	});
});
