import {
	extractTransactionDetails,
	extractDateFromDescription,
	extractPriceFromInstagramDescription,
} from './price.helper.js';

describe('extractPriceFromInstagramDescription', () => {
	test('should extract price from text with valid format', () => {
		const text = 'Check out our new product! Price: 💵 Bs. 1234,56';
		const expectedPrice = 1234.56;

		const result = extractPriceFromInstagramDescription(text);

		expect(result).toEqual(expectedPrice);
	});

	test('should extract price from text with no decimal places', () => {
		const text = 'Price: 💵 Bs. 1000,00';
		const expectedPrice = 1000;

		const result = extractPriceFromInstagramDescription(text);

		expect(result).toEqual(expectedPrice);
	});

	test('should extract price from text with no thousands separators', () => {
		const text = 'Price: 💵 Bs. 1234,56';
		const expectedPrice = 1234.56;

		const result = extractPriceFromInstagramDescription(text);

		expect(result).toEqual(expectedPrice);
	});

	test('should return null for text without price', () => {
		const text = 'Check out our new product!';
		const expectedPrice = null;

		const result = extractPriceFromInstagramDescription(text);

		expect(result).toEqual(expectedPrice);
	});
});

describe('extractDateFromDescription', () => {
	// Tests that the function returns the date when the text contains a valid date preceded by the 🗓 emoji
	it('should return the date when the text contains a valid date preceded by the 🗓 emoji', () => {
		const text = '🗓 12/05/2022';
		expect(extractDateFromDescription(text)).toBe('12/05/2022');
	});

	// Tests that the function returns null when the text does not contain a valid date preceded by the 🗓 emoji
	it('should return null when the text does not contain a valid date preceded by the 🗓 emoji', () => {
		const text = 'No date here';
		expect(extractDateFromDescription(text)).toBeNull();
	});

	// Tests that the function returns null when the text is empty
	it('should return null when the text is empty', () => {
		const text = '';
		expect(extractDateFromDescription(text)).toBeNull();
	});

	// Tests that the function returns null when the text does not contain the 🗓 emoji
	it('should return null when the text does not contain the 🗓 emoji', () => {
		const text = 'No emoji here 12/05/2022';
		expect(extractDateFromDescription(text)).toBeNull();
	});

	// Tests that the function returns null when the text contains the 🗓 emoji but the date is not in the correct format (dd/mm/yyyy)
	it('should return null when the text contains the 🗓 emoji but the date is not in the correct format (dd/mm/yyyy)', () => {
		const text = '🗓 05-12-2022';
		expect(extractDateFromDescription(text)).toBeNull();
	});

	// Tests that the function returns the date when the text contains multiple instances of the 🗓 emoji and valid dates
	it('should return the date when the text contains multiple instances of the 🗓 emoji and valid dates', () => {
		const text = '🗓 12/05/2022 Some text 🗓 01/01/2023';
		expect(extractDateFromDescription(text)).toBe('12/05/2022');
	});
});

describe('extractTransactionDetails', () => {
	// Returns the correct amount when the total line contains a number with a dot as decimal separator
	it('should return the correct amount when the total line contains a number with a dot as decimal separator', () => {
		const data = ['Total: 1.23'];
		const result = extractTransactionDetails(data);
		expect(result.amount).toBe(1.23);
	});

	// Returns the correct amount when the total line contains a number with a comma as decimal separator
	it('should return the correct amount when the total line contains a number with a comma as decimal separator', () => {
		const data = ['Total: 1,23'];
		const result = extractTransactionDetails(data);
		expect(result.amount).toBe(1.23);
	});

	// Returns the correct amount when the total line contains a number with a comma as thousands separator
	it('should return the correct amount when the total line contains a number with a comma as thousands separator', () => {
		const data = ['Total: 1,000.23'];
		const result = extractTransactionDetails(data);
		expect(result.amount).toBe(1000.23);
	});

	// Returns the correct amount when the total line contains multiple numbers, but only one is the actual amount
	it('should return the correct amount when the total line contains multiple numbers, but only one is the actual amount', () => {
		const data = ['Total: 1,000.23', 'Other: 2,000.00'];
		const result = extractTransactionDetails(data);
		expect(result.amount).toBe(1000.23);
	});

	// Returns the correct amount when the total line contains a number with more than two decimal places
	it('should return the correct amount when the total line contains a number with more than two decimal places', () => {
		const data = ['Total: 1.2345\n' + 'Fecha: 02/01/2022'];
		const { amount, date } = extractTransactionDetails(data);
		expect(amount).toBe(1.2345);
		expect(date).toBe('2022-01-02');
	});
});
