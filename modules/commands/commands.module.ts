import { Image2TextService } from '../image-2-text/image-2-text.module';
import { BaseTransactions } from '../base-transactions/base-transactions.module';
import { MercantilPanama } from '../mercantil-panama/mercantil-panama.module';
import { PayPal } from '../paypal/paypal.module';
import { Reports } from '../reports/reports.module';
import dayjs from 'dayjs';
import logger from '../../src/lib/logger';

interface RegisterTransactionInput {
	images: string[];
	telegramFileIds: string[];
	commandArgs: string[];
}

type CommandFunction = (data: string | string[] | RegisterTransactionInput) => Promise<string>;

interface Commands {
	[key: string]: CommandFunction;
}

interface CommandDefinitions {
	[key: string]: string;
}

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
			cashTransaction: async (data: unknown) => {
				logger.info('Cash transaction command received', { data });
				return 'Cash transaction';
			},
			mercantil: async (data: unknown) => {
				await MercantilPanama.registerMercantilTransactionsFromCSVData(data as string);
				return 'Mercantil transactions registered';
			},
			paypal: async (data: unknown) => {
				await PayPal.registerPaypalDataFromCSVData(data as string);
				return 'Paypal transactions registered';
			},
			monthlyReport: async (monthDate: unknown) => {
				const reportData = await Reports.getMonthlyReport(monthDate as string);
				return Reports.reportMessageOnMarkdown(reportData);
			},
			baseTransactions: async (data: unknown) => {
				await BaseTransactions.registerManualTransactions(data as string[]);
				return 'Manual transaction registered';
			},
			registerTransaction: async (input: unknown) => {
				const { images, telegramFileIds, commandArgs } = input as RegisterTransactionInput;
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
			test: async (data: unknown) => data as string,
		} as unknown as Commands;
	}

	async executeCommand(command: string, data: unknown): Promise<string> {
		if (this.commands[command]) {
			return this.commands[command](data as string);
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
