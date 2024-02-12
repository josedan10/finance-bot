import { Image2TextService } from '../image-2-text/image-2-text.module.js';
import { ManualTransaction } from '../manual-transactions/index.js';
import { MercantilPanama } from '../mercantil-panama/index.js';
import { PayPal } from '../paypal/paypal.module.js';
import { Reports } from '../reports/reports.module.js';

class CommandsModule {
	constructor() {
		this.publishedCommandsDefinitions = {
			mercantil:
				'Register Mercantil Panama transactions from CSV data. Upload a CSV file with the Mercantil Panama transactions',
			paypal: 'Register PayPal transactions from CSV data. Upload a CSV file with the PayPal transactions',
			monthlyReport:
				'Get a monthly report. Send a month number as example: 01 for January, 02 for February, etc. Example command: /monthlyReport 01',
		};

		this.commandsList = {
			mercantil: 'mercantil',
			paypal: 'paypal',
			monthlyReport: 'monthlyReport',
			cashTransaction: 'cashTransaction',
			manualTransaction: 'manualTransaction',
			transactionReceipt: 'transactionReceipt',
			test: 'test',
		};

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
			manualTransaction: async (data) => {
				await ManualTransaction.registerManualTransaction(data);
				return 'Manual transaction registered';
			},
			transactionReceipt: async (images) => {
				const texts = await Image2TextService.extractTextFromImages(images);
				return texts;
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

	getCommandsArray() {
		return Object.entries(this.publishedCommandsDefinitions).map(([cmd, description]) => ({
			command: cmd,
			description,
		}));
	}
}

export default new CommandsModule();
