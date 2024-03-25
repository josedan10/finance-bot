import { convertStringIntoCSSSelectorClasses } from './css.helper';

describe('convertStringIntoCSSSelectorClasses', () => {
	it('should convert a single word string into a CSS selector class', () => {
		const result = convertStringIntoCSSSelectorClasses('hello');
		expect(result).toEqual('.hello');
	});

	it('should convert a multi-word string into a CSS selector class', () => {
		const result = convertStringIntoCSSSelectorClasses('hello world');
		expect(result).toEqual('.hello.world');
	});

	it('should handle leading/trailing spaces in the input string', () => {
		const result = convertStringIntoCSSSelectorClasses('  hello world  ');
		expect(result).toEqual('.hello.world');
	});

	it('should handle empty input string', () => {
		const result = convertStringIntoCSSSelectorClasses('');
		expect(result).toEqual('');
	});
});
