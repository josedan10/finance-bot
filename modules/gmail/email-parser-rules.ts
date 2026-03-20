export interface ParsedTransaction {
	amount: number;
	currency: string;
	description: string;
	type: 'debit' | 'credit';
	paymentMethod: string;
	category?: string;
	referenceId?: string;
}

export interface EmailParserRule {
	name: string;
	match: (from: string, subject: string) => boolean;
	parse: (body: string, date: Date) => ParsedTransaction | null;
}

const bankNotificationRule: EmailParserRule = {
	name: 'BankNotification',
	match: (from, subject) => {
		const bankDomains = ['mercantil.com', 'banesco.com', 'provincial.com', 'bod.com.ve'];
		const fromLower = from.toLowerCase();
		const subjectLower = subject.toLowerCase();
		return (
			bankDomains.some((domain) => fromLower.includes(domain)) ||
			subjectLower.includes('transferencia') ||
			subjectLower.includes('transacción') ||
			subjectLower.includes('débito') ||
			subjectLower.includes('crédito')
		);
	},
	parse: (body) => {
		const amountMatch = body.match(
			/(?:monto|amount|total|valor|bs\.?|usd|\$)\s*[:.]?\s*([\d.,]+)/i
		);
		if (!amountMatch) return null;

		const rawAmount = amountMatch[1].replace(/\./g, '').replace(',', '.');
		const amount = parseFloat(rawAmount);
		if (isNaN(amount) || amount <= 0) return null;

		const isCredit =
			/cr[eé]dito|abono|deposit|received|ingreso/i.test(body);
		const isVES = /bs\.?|ves|bol[ií]var/i.test(body);

		const refMatch = body.match(/(?:ref(?:erencia)?|nro|número|confirmation)\s*[:.]?\s*([A-Za-z0-9-]+)/i);
		const descMatch = body.match(/(?:concepto|descripci[oó]n|motivo|detail)\s*[:.]?\s*(.{5,80})/i);

		return {
			amount,
			currency: isVES ? 'VES' : 'USD',
			description: descMatch?.[1]?.trim() || 'Bank transaction',
			type: isCredit ? 'credit' : 'debit',
			paymentMethod: 'Mercantil Venezuela',
			referenceId: refMatch?.[1],
		};
	},
};

const paypalReceiptRule: EmailParserRule = {
	name: 'PaypalReceipt',
	match: (from, subject) => {
		return (
			from.toLowerCase().includes('paypal') ||
			subject.toLowerCase().includes('paypal') ||
			subject.toLowerCase().includes('receipt for your payment')
		);
	},
	parse: (body) => {
		const amountMatch = body.match(
			/(?:total|amount|you (?:sent|paid|received))\s*[:.]?\s*\$?\s*([\d.,]+)\s*(USD|EUR)?/i
		);
		if (!amountMatch) return null;

		const rawAmount = amountMatch[1].replace(/,/g, '');
		const amount = parseFloat(rawAmount);
		if (isNaN(amount) || amount <= 0) return null;

		const isCredit = /received|refund|reembolso/i.test(body);
		const currency = amountMatch[2]?.toUpperCase() || 'USD';

		const merchantMatch = body.match(/(?:to|merchant|comercio|para)\s*[:.]?\s*(.{3,60}?)(?:\n|$|\.)/i);

		return {
			amount,
			currency,
			description: merchantMatch?.[1]?.trim() || 'PayPal transaction',
			type: isCredit ? 'credit' : 'debit',
			paymentMethod: 'Paypal',
		};
	},
};

const subscriptionRule: EmailParserRule = {
	name: 'SubscriptionRenewal',
	match: (from, subject) => {
		const subjectLower = subject.toLowerCase();
		const fromLower = from.toLowerCase();
		const subscriptionKeywords = [
			'renewal', 'subscription', 'renovación', 'suscripción',
			'billing', 'invoice', 'your membership', 'auto-renewal',
		];
		const subscriptionSenders = [
			'netflix', 'spotify', 'disney', 'amazon', 'google',
			'apple', 'microsoft', 'digital ocean', 'github',
			'hbo', 'youtube', 'platzi',
		];
		return (
			subscriptionKeywords.some((kw) => subjectLower.includes(kw)) ||
			subscriptionSenders.some((s) => fromLower.includes(s) && subjectLower.includes('payment'))
		);
	},
	parse: (body) => {
		const amountMatch = body.match(
			/(?:total|amount|charge|cobro|precio|price)\s*[:.]?\s*\$?\s*([\d.,]+)\s*(USD|EUR)?/i
		);
		if (!amountMatch) return null;

		const rawAmount = amountMatch[1].replace(/,/g, '');
		const amount = parseFloat(rawAmount);
		if (isNaN(amount) || amount <= 0) return null;

		const currency = amountMatch[2]?.toUpperCase() || 'USD';
		const serviceMatch = body.match(/(?:service|plan|subscription to|suscripción a)\s*[:.]?\s*(.{3,50}?)(?:\n|$|\.)/i);

		return {
			amount,
			currency,
			description: serviceMatch?.[1]?.trim() || 'Subscription renewal',
			type: 'debit' as const,
			paymentMethod: 'Paypal',
			category: 'ENTERTAINMENT',
		};
	},
};

const invoiceRule: EmailParserRule = {
	name: 'InvoiceOrReceipt',
	match: (from, subject) => {
		const subjectLower = subject.toLowerCase();
		return (
			subjectLower.includes('order confirmation') ||
			subjectLower.includes('purchase') ||
			subjectLower.includes('receipt') ||
			subjectLower.includes('invoice') ||
			subjectLower.includes('factura') ||
			subjectLower.includes('compra') ||
			subjectLower.includes('confirmación de pedido')
		);
	},
	parse: (body) => {
		const amountMatch = body.match(
			/(?:total|grand total|order total|amount|monto)\s*[:.]?\s*\$?\s*([\d.,]+)\s*(USD|EUR|VES)?/i
		);
		if (!amountMatch) return null;

		const rawAmount = amountMatch[1].replace(/,/g, '');
		const amount = parseFloat(rawAmount);
		if (isNaN(amount) || amount <= 0) return null;

		const currency = amountMatch[2]?.toUpperCase() || 'USD';

		const vendorMatch = body.match(/(?:from|seller|vendedor|sold by|tienda)\s*[:.]?\s*(.{3,60}?)(?:\n|$|\.)/i);
		const refMatch = body.match(/(?:order|pedido|invoice|factura)\s*#?\s*[:.]?\s*([A-Za-z0-9-]+)/i);

		return {
			amount,
			currency,
			description: vendorMatch?.[1]?.trim() || 'Purchase',
			type: 'debit' as const,
			paymentMethod: 'Paypal',
			category: 'PURCHASE',
			referenceId: refMatch?.[1],
		};
	},
};

export const emailParserRules: EmailParserRule[] = [
	bankNotificationRule,
	paypalReceiptRule,
	subscriptionRule,
	invoiceRule,
];
