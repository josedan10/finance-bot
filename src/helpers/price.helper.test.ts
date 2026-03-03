import {
	extractPriceFromInstagramDescription,
	extractDateFromDescription,
	extractTransactionDetails,
	getTotalFromDataText,
} from './price.helper';

describe('price.helper', () => {
	describe('extractPriceFromInstagramDescription', () => {
		it('should extract correct price value wrapped in standard format', () => {
			expect(extractPriceFromInstagramDescription('Item cost is 💵 Bs. 15,50.')).toBe(15.5);
			expect(extractPriceFromInstagramDescription('💵 Bs. 1,00')).toBe(1.0);
		});

		it('should return null when price format does not match', () => {
			expect(extractPriceFromInstagramDescription('Total: 50.00')).toBeNull();
			expect(extractPriceFromInstagramDescription('Bs. 10,00')).toBeNull(); // Missing emoji
		});
	});

	describe('extractDateFromDescription', () => {
		it('should extract date successfully', () => {
			expect(extractDateFromDescription('🗓 22/05/2023')).toBe('22/05/2023');
		});

		it('should return null on invalid date formats', () => {
			expect(extractDateFromDescription('22/05/2023')).toBeNull(); // Missing emoji
			expect(extractDateFromDescription('🗓 22-05-2023')).toBeNull();
		});
	});

	describe('getTotalFromDataText', () => {
		it('should parse thousands separators correctly when comma is decimal', () => {
			expect(getTotalFromDataText(['Total: 1.500,50'])).toBe(1500.5);
		});

		it('should parse thousands separators correctly when dot is decimal', () => {
			expect(getTotalFromDataText(['Total: 1,500.50'])).toBe(1500.5);
		});

		it('should parse numeric strings without thousand separators', () => {
			expect(getTotalFromDataText(['Total: 500,50'])).toBe(500.5);
			expect(getTotalFromDataText(['Total: 500.50'])).toBe(500.5);
			expect(getTotalFromDataText(['Total: 500'])).toBe(500);
		});

		it('should fallback to BS matches when Total is missing', () => {
			expect(getTotalFromDataText(['Cost', 'Bs 1.000,00'])).toBe(1000);
		});

		it('should return null when no actionable numeric string is given', () => {
			expect(getTotalFromDataText(['hello world', 'nothing to see here'])).toBeNull();
		});
	});

	describe('extractTransactionDetails', () => {
		it('extracts valid transaction date and builds YYYY-MM-DD', () => {
			const dt = extractTransactionDetails(['fecha: 22/05/2023', 'Total: 1,500.50']);
			expect(dt.amount).toBe(1500.5);
			expect(dt.date).toBe('2023-05-22');
		});

		it('extracts hyphenated dates gracefully', () => {
			const dt = extractTransactionDetails(['Fecha 22-05-2023', 'Total: 100']);
			expect(dt.date).toBe('2023-05-22');
		});

		it('should handle absent dates returning null for the property', () => {
			const dt = extractTransactionDetails(['Total 100']);
			expect(dt.date).toBeNull();
		});

		it('should handle completely invalid formats gracefully', () => {
			const dt = extractTransactionDetails(['Not valid at all']);
			expect(dt.amount).toBeNull();
			expect(dt.date).toBeNull();
		});
	});
});
