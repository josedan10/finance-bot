import { MercantilPanama } from '../mercantil-panama/index.js';
import { PayPal } from '../paypal/paypal.module.js';
import { Reports } from '../reports/reports.module.js';

class CommandsModule {
	constructor() {
		this.commands = {
			cashTransaction: async (data) => {
				console.log(data);
				return 'Cash transaction';
			},
			mercantil: async (data) => {
				await MercantilPanama.registerMercantilTransactionsFromCSVData(data);
				return 'Mercantil transactions registered';
			},
			paypal: async (data) => {
				await PayPal.registerPaypalDataFromCSVData(data);
				return 'Paypal transactions registered';
			},
			monthlyReport: async (monthDate) => {
				const reportData = await Reports.getMonthlyReport(monthDate);
				return Reports.reportMessageOnMarkdown(reportData);
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

export default new CommandsModule();
