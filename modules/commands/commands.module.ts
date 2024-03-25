/* eslint-disable @typescript-eslint/no-explicit-any */
import { Image2TextService } from '../image-2-text/image-2-text.module';
import { BaseTransactions } from '../base-transactions/base-transactions.module';
import { MercantilPanama } from '../mercantil-panama/mercantil-panama.module';
import { PayPal } from '../paypal/paypal.module';
import { Reports } from '../reports/reports.module';
import dayjs from 'dayjs';

interface CommandFunctions {
	(data: any): Promise<string>;
}

interface Commands {
	[key: string]: CommandFunctions;
}

interface CommandDefinitions {
	[key: string]: string;
}

// TODO: fix types
class CommandsModule {
	private publishedCommandsDefinitions: CommandDefinitions;
	public commandsList: CommandDefinitions;
	public commands: Commands;

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
			baseTransactions: 'baseTransactions',
			registerTransaction: 'registerTransaction',
			test: 'test',
		};

		this.commands = {
			cashTransaction: async (data: any) => {
				console.log(data);
				return 'Cash transaction';
			},
			mercantil: async (data: any) => {
				await MercantilPanama.registerMercantilTransactionsFromCSVData(data);
				return 'Mercantil transactions registered';
			},
			paypal: async (data: any) => {
				await PayPal.registerPaypalDataFromCSVData(data);
				return 'Paypal transactions registered';
			},
			monthlyReport: async (monthDate: string) => {
				const reportData = await Reports.getMonthlyReport(monthDate);
				return Reports.reportMessageOnMarkdown(reportData);
			},
			baseTransactions: async (data: any) => {
				await BaseTransactions.registerManualTransactions(data);
				return 'Manual transaction registered';
			},
			// TODO: refactor this function
			registerTransaction: async ({ images, telegramFileIds, commandArgs }: any) => {
				const texts = await Image2TextService.extractTextFromImages(images);
				const { transaction, category } = await BaseTransactions.registerTransactionFromImages(
					texts,
					telegramFileIds,
					commandArgs
				);

				const formattedDate = dayjs(transaction.date).format('DD/MM/YYYY');

				return `📝 Transaction registered: ${transaction.originalCurrencyAmount} ${transaction.currency}${
					transaction.amount ? ` ~ $${transaction.amount}` : ''
				} 💵 | ${category?.name} - ${formattedDate}

💬 ${transaction.description}
${transaction.reviewed ? '✅ Reviewed' : '❌ Not reviewed'}`;
			},
			test: async (data: any) => data,
		};
	}

	async executeCommand(command: string, data: any): Promise<string> {
		if (this.commands[command]) {
			return this.commands[command](data);
		}

		throw new Error(`Command ${command} not found`);
	}

	getCommandsArray(): { command: string; description: string }[] {
		return Object.entries(this.publishedCommandsDefinitions).map(([cmd, description]) => ({
			command: cmd,
			description,
		}));
	}
}

export default new CommandsModule();
