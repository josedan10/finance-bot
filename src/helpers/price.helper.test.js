import { extractPriceFromInstagramDescription } from './price.helper.js';

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
