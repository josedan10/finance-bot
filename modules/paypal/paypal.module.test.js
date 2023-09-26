import { PayPal } from './paypal.module.js';
import { faker } from '@faker-js/faker';
import dayjs from 'dayjs';
import Sinon from 'sinon';
import prisma from '../database/database.module.js';

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

	describe('getPaypalDataFromCSVData', () => {
		const generateDateAndTime = () => {
			const dateForTest = faker.date.between('2000-01-01', '2010-12-31');

			const date = dayjs(dateForTest).format('YYYY-MM-DD');
			const time = dayjs(dateForTest).format('HH:mm:ss');
			return { date, time };
		};

		const paymentMethod = { id: 1 };
		const categories = [{ id: 1 }];
		const transaction = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

		const transationTableResult = paymentMethod;

		prisma.paymentMethod.findUnique = Sinon.stub().resolves(paymentMethod);
		prisma.category.findMany = Sinon.stub().resolves(categories);
		prisma.$transaction = Sinon.stub().resolves(transaction);
		prisma.transaction.create = Sinon.stub().resolves(transationTableResult);

		const dateTime1 = generateDateAndTime();
		const dateTime2 = generateDateAndTime();
		const dateTime3 = generateDateAndTime();
		const dateTime4 = generateDateAndTime();

		const csvData = `Fecha,Hora,Zona horaria,Nombre,Tipo,Estado,Divisa,Bruto,Comisión,Neto,Correo electrónico del remitente,Correo electrónico del destinatario,Id. de transacción,Dirección de envío,Estado de la dirección,Nombre del artículo,Id. del artículo,Importe de envío y manipulación,Importe del seguro,Impuesto sobre ventas,Nombre de la opción 1,Valor de la opción 1,Nombre de la opción 2,Valor de la opción 2,Id. de referencia de la transacción,N.° de formato de pago,Número personalizado,Cantidad,Id.del formato de pago,Saldo,Dirección,Dirección (continuación)/Distrito/Barrio,Población o Ciudad,Estado/Provincia/Región/Condado/Territorio/Prefectura/República,Código postal,País,Número de teléfono de contacto,Asunto,Nota,Código de país,Repercusiones en el saldo
		${dateTime1.date},${dateTime1.time},PDT,"Disney DTC LATAM, Inc.",TEST,Completado,USD,"-5,99","0,00","-5,99",josedanq100@gmail.com,CORP.DL-DSSVE@disney.com,88945731C0646752T,,No confirmada,| Disney Plus Monthly - VE - Web,0,"0,00",,"0,00",,,,,B-0Y0262488W109263R,1.00106E+12,,1,,"16,90",,,,,,,,| Disney Plus Monthly - VE - Web,,,Cargo
		${dateTime2.date},${dateTime2.time},PDT,Productora Audiovisual,TEST,Completado,USD,"698,00","-37,99","660,01",blacksheepproductions.adm@gmail.com,josedanq100@gmail.com,5JB6428572966460A,"Nedith Meynel, Borges Canario, Calle Guaicaipuro Casa 108-A, Los Teques, Los Teques, ESTADO MIRANDA, 1201, Venezuela",No confirmada,,,,,,,,,,,,,,,"676,91",Calle Guaicaipuro Casa 108-A,Los Teques,Los Teques,ESTADO MIRANDA,1201,Venezuela,4241238118,,Varios�,VE,Crédito
		${dateTime3.date},${dateTime3.time},PDT,Productora Audiovisual,TEST,Completado,USD,"698,00","-37,99","660,01",blacksheepproductions.adm@gmail.com,josedanq100@gmail.com,4L054218UK407305W,,No confirmada,,,,,,,,,,,,,,,"1.336,92",,,,,,,4241238118,,Varios �,,Crédito
		${dateTime4.date},${dateTime4.time},PDT,,TEST ,Completado,USD,"-1.320,00","0,00","-1.320,00",josedanq100@gmail.com,,54E08306FN9278418,,,,,,,,,,,,,,,,,"16,92",,,,,,,,,,,Cargo`;
		test('It should create the transactions', async () => {
			const result = await PayPal.registerPaypalDataFromCSVData(csvData);
			console.log(result);
			expect(result).toHaveLength(4);
			Sinon.assert.calledOnce(prisma.$transaction);
			Sinon.assert.calledOnce(prisma.paymentMethod.findUnique);
			Sinon.assert.calledOnce(prisma.category.findMany);
		});
	});
});
