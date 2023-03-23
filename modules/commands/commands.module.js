import { MercantilPanama } from '../mercantil-panama/index.js';

class CommandsModule {
	constructor() {
		this.commands = {
			cashTransaction: async (data) => {
				console.log(data);
				return 'Cash transaction';
			},
			mercantil: MercantilPanama.registerMercantilTransactionsFromCSVData,
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

export default new CommandsModule();
