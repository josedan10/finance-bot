import { GmailEmail } from './gmail.module';
import { emailParserRules, ParsedTransaction, EmailParserRule } from './email-parser-rules';
import logger from '../../src/lib/logger';

export interface EmailParseResult {
	email: GmailEmail;
	parsed: ParsedTransaction | null;
	ruleName: string | null;
}

class EmailParser {
	private rules: EmailParserRule[];

	constructor(rules: EmailParserRule[] = emailParserRules) {
		this.rules = rules;
	}

	parseEmail(email: GmailEmail): EmailParseResult {
		for (const rule of this.rules) {
			try {
				if (rule.match(email.from, email.subject)) {
					const parsed = rule.parse(email.body, email.date);
					if (parsed) {
						logger.info(`Email parsed by rule "${rule.name}"`, {
							messageId: email.messageId,
							from: email.from,
							subject: email.subject,
							amount: parsed.amount,
							currency: parsed.currency,
						});
						return { email, parsed, ruleName: rule.name };
					}
				}
			} catch (error) {
				logger.error(`Error in parser rule "${rule.name}"`, {
					messageId: email.messageId,
					error,
				});
			}
		}

		logger.info('No parser rule matched email', {
			messageId: email.messageId,
			from: email.from,
			subject: email.subject,
		});

		return { email, parsed: null, ruleName: null };
	}

	parseEmails(emails: GmailEmail[]): EmailParseResult[] {
		return emails.map((email) => this.parseEmail(email));
	}
}

export const emailParser = new EmailParser();
