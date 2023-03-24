import { MercantilPanama } from '../mercantil-panama/index.js';
import { Reports } from '../reports/reports.module.js';

class CommandsModule {
	constructor() {
		this.commands = {
			cashTransaction: async (data) => {
				console.log(data);
				return 'Cash transaction';
			},
			mercantil: MercantilPanama.registerMercantilTransactionsFromCSVData,
			monthlyReport: Reports.getMonthlyReport,
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
