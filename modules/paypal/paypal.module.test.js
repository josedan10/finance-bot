import { PayPal } from './paypal.module.js';

describe('PaypalModule', () => {
	let paypalModule;

	beforeEach(() => {
		paypalModule = PayPal;
	});

	describe('getColumnIndex', () => {
		it('should return the correct index for column A', () => {
			expect(paypalModule.getColumnIndex('A')).toEqual(0);
		});

		it('should return the correct index for column L', () => {
			expect(paypalModule.getColumnIndex('L')).toEqual(11);
		});

		it('should return the correct index for column Z', () => {
			expect(paypalModule.getColumnIndex('Z')).toEqual(25);
		});

		it('should return the correct index for column AA', () => {
			expect(paypalModule.getColumnIndex('AA')).toEqual(26);
		});

		it('should return the correct index for column AB', () => {
			expect(paypalModule.getColumnIndex('AB')).toEqual(27);
		});

		it('should return the correct index for column AL', () => {
			expect(paypalModule.getColumnIndex('AL')).toEqual(37);
		});

		it('should return the correct index for column AM', () => {
			expect(paypalModule.getColumnIndex('AM')).toEqual(38);
		});

		it('should return the correct index for column AO', () => {
			expect(paypalModule.getColumnIndex('AO')).toEqual(40);
		});
	});

	describe('getDataFromCSVData', () => {
		// Array until column AO
		const csvData = [
			[
				'A',
				'B',
				'C',
				'D',
				'E',
				'F',
				'G',
				'H',
				'I',
				'J',
				'K',
				'L',
				'M',
				'N',
				'O',
				'P',
				'Q',
				'R',
				'S',
				'T',
				'U',
				'V',
				'W',
				'X',
				'Y',
				'Z',
				'AA',
				'AB',
				'AC',
				'AD',
				'AE',
				'AF',
				'AG',
				'AH',
				'AI',
				'AJ',
				'AK',
				'AL',
				'AM',
				'AN',
				'AO',
			],
			[
				'1',
				'2',
				'3',
				'4',
				'5',
				'6',
				'7',
				'8',
				'9',
				'10',
				'11',
				'12',
				'13',
				'14',
				'15',
				'16',
				'17',
				'18',
				'19',
				'20',
				'21',
				'22',
				'23',
				'24',
				'25',
				'26',
				'27',
				'28',
				'29',
				'30',
				'31',
				'32',
				'33',
				'34',
				'35',
				'36',
				'37',
				'38',
				'39',
				'40',
				'41',
			],
			[
				'a',
				'b',
				'c',
				'd',
				'e',
				'f',
				'g',
				'h',
				'i',
				'j',
				'k',
				'l',
				'm',
				'n',
				'o',
				'p',
				'q',
				'r',
				's',
				't',
				'u',
				'v',
				'w',
				'x',
				'y',
				'z',
				'aa',
				'ab',
				'ac',
				'ad',
				'ae',
				'af',
				'ag',
				'ah',
				'ai',
				'aj',
				'ak',
				'al',
				'am',
				'an',
				'ao',
			],
			[
				'A1',
				'B2',
				'C3',
				'D4',
				'E5',
				'F6',
				'G7',
				'H8',
				'I9',
				'J10',
				'K11',
				'L12',
				'M13',
				'N14',
				'O15',
				'P16',
				'Q17',
				'R18',
				'S19',
				'T20',
				'U21',
				'V22',
				'W23',
				'X24',
				'Y25',
				'Z26',
				'AA27',
				'AB28',
				'AC29',
				'AD30',
				'AE31',
				'AF32',
				'AG33',
				'AH34',
				'AI35',
				'AJ36',
				'AK37',
				'AL38',
				'AM39',
				'AN40',
				'AO41',
			],
		];

		it('should return an array with the extracted values for the specified columns', () => {
			// Array of four rows, each row contains the values of the specified columns
			const expectedData = [
				['A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'M', 'P', 'AL', 'AM', 'AO'],
				['1', '2', '3', '4', '5', '6', '7', '10', '13', '16', '38', '39', '41'],
				['a', 'b', 'c', 'd', 'e', 'f', 'g', 'j', 'm', 'p', 'al', 'am', 'ao'],
				['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'J10', 'M13', 'P16', 'AL38', 'AM39', 'AO41'],
			];

			expect(paypalModule.getDataFromCSVData(csvData)).toEqual(expectedData);
		});

		it('should handle empty CSV data', () => {
			const emptyCsvData = [];
			expect(paypalModule.getDataFromCSVData(emptyCsvData)).toEqual([]);
		});

		it('should handle CSV data with fewer columns than the specified column names', () => {
			const csvDataWithFewerColumns = [['A', 'B', 'C']];
			expect(paypalModule.getDataFromCSVData(csvDataWithFewerColumns)).toEqual([]);
		});

		it('should handle CSV data with empty rows', () => {
			const csvDataWithEmptyRows = [['A', 'B', 'C'], [], ['1', '2', '3']];
			const expectedData = [];
			expect(paypalModule.getDataFromCSVData(csvDataWithEmptyRows)).toEqual(expectedData);
		});

		it('should handle CSV data with undefined values', () => {
			const csvDataWithUndefinedValues = JSON.parse(JSON.stringify(csvData));
			csvDataWithUndefinedValues[0][1] = undefined;
			csvDataWithUndefinedValues[1][1] = undefined;
			csvDataWithUndefinedValues[2][1] = undefined;
			csvDataWithUndefinedValues[3][1] = undefined;

			const expectedData = [
				['A', undefined, 'C', 'D', 'E', 'F', 'G', 'J', 'M', 'P', 'AL', 'AM', 'AO'],
				['1', undefined, '3', '4', '5', '6', '7', '10', '13', '16', '38', '39', '41'],
				['a', undefined, 'c', 'd', 'e', 'f', 'g', 'j', 'm', 'p', 'al', 'am', 'ao'],
				['A1', undefined, 'C3', 'D4', 'E5', 'F6', 'G7', 'J10', 'M13', 'P16', 'AL38', 'AM39', 'AO41'],
			];
			expect(paypalModule.getDataFromCSVData(csvDataWithUndefinedValues)).toEqual(expectedData);
		});
	});
});
