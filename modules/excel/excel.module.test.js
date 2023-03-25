import ExcelModule from './excel.module.js';

describe('ExcelModule', () => {
	test('should parse CSV data to Javascript array', () => {
		const csvData = `Name,Age,Gender\r
    Name,Age,Gender\r
    John,30,Male\r
    Jane,25,Female\r`;
		const expectedData = [
			['John', '30', 'Male'],
			['Jane', '25', 'Female'],
		];
		const result = ExcelModule.parseCSVDataToJs(csvData, 2);
		expect(result).toEqual(expectedData);
	});

	test('should remove the titles from the parsed data', () => {
		const csvData = `Name,Age,Gender\r
    Name,Age,Gender\r
    John,30,Male\r
    Jane,25,Female\r`;
		const expectedData = [
			['John', '30', 'Male'],
			['Jane', '25', 'Female'],
		];
		expect(ExcelModule.parseCSVDataToJs(csvData, 2)).toEqual(expectedData);

		// The original data includes the title row and an empty row after it
		expect(ExcelModule.parseCSVDataToJs(csvData, 2)).toHaveLength(2);
	});

	test('should handle edge cases correctly', () => {
		// When input is an empty string, an empty array should be returned
		expect(ExcelModule.parseCSVDataToJs('', 2)).toEqual([]);

		// When input contains only one row, the output should be a single-item array
		const singleRowCsv = `Name,Age,Gender\r
    Name,Age,Gender\r
    Jane,25,Female\r`;
		expect(ExcelModule.parseCSVDataToJs(singleRowCsv, 2)).toEqual([['Jane', '25', 'Female']]);

		// When input contains only one column, the output should have a single-item array for each row
		const singleColumnCsv = 'Name\r\nName\r\nJohn\r\nJane';
		expect(ExcelModule.parseCSVDataToJs(singleColumnCsv, 2)).toEqual([['John'], ['Jane']]);
	});
});
