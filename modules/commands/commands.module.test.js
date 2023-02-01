import commandsModule from './commands.module.js';

describe('>> Commands Module: ', function () {
	test('Commands initialized', () => {
		expect(Object.keys(commandsModule.commands)).toHaveLength(2);
	});

	test('Execute command', async () => {
		const data = await commandsModule.executeCommand('test', 'test');
		expect(data).toBeDefined();
	});

	test('Execute command with error', async () => {
		await expect(commandsModule.executeCommand('test1', 'test')).rejects.toThrow();
	});

	test('Execute cashTransaction command', async () => {
		await expect(commandsModule.executeCommand('cashTransaction', 'test')).toBeDefined();
	});
});
