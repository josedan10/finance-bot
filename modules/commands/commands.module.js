const googleSheetsModule = require('../google-sheets/google-sheets.module');

class CommandsModule {
	constructor() {
		this.commands = {
			cashTransaction: async (data) => {
				try {
					console.log(data);
					return await googleSheetsModule.getSheetData();
				} catch (error) {
					console.log(error);
					throw new Error(error);
				}
			},
			test: async (data) => data,
		};
	}

	async executeCommand(command, data) {
		if (this.commands[command]) {
			return this.commands[command](data);
		}

		throw new Error(`Command ${command} not found`);
	}
}

module.exports = new CommandsModule();
