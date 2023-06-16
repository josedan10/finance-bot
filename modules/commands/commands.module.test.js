import { faker } from '@faker-js/faker';
import dayjs from 'dayjs';
import commandsModule from './commands.module.js';

describe('>> Commands Module: ', function () {
	test('Commands initialized', () => {
		expect(Object.keys(commandsModule.commands)).toHaveLength(5);
	});

	test('Execute command', async () => {
		const data = await commandsModule.executeCommand('test', 'test');
		expect(data).toBeDefined();
	});

	test('Execute command with error', async () => {
		await expect(commandsModule.executeCommand('test1', 'test')).rejects.toThrow();
	});

	test('Execute monthlyReport command', async () => {
		const data = await commandsModule.executeCommand('monthlyReport', '01');
		expect(data).toBeDefined();
	});

	test('Execute cashTransaction command', async () => {
		await expect(commandsModule.executeCommand('cashTransaction', 'test')).toBeDefined();
	});

	test('Execute mercantil command', async () => {
		const exampleCSVData = `"Mercantil Banco, Sistema de Banca por Internet",,,,
  Fecha,Descripción,No. de Referencia,Débito,Crédito
  03/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/385571/TEST        0 021,385571,,5.09
  01/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/386352/TEST        0 021,386352,2.08,
  02/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/391248/TEST        0 021,391248,4.63,`;
		const data = await commandsModule.executeCommand('mercantil', exampleCSVData);
		expect(data).toBeDefined();
	});

	test('Execute paypal command', async () => {
		const generateDateAndTime = () => {
			const dateForTest = faker.date.between('2000-01-01', '2010-12-31');

			const date = dayjs(dateForTest).format('YYYY-MM-DD');
			const time = dayjs(dateForTest).format('HH:mm:ss');
			return { date, time };
		};

		const dateTime1 = generateDateAndTime();
		const dateTime2 = generateDateAndTime();
		const dateTime3 = generateDateAndTime();
		const dateTime4 = generateDateAndTime();

		const csvData = `Fecha,Hora,Zona horaria,Nombre,Tipo,Estado,Divisa,Bruto,Comisión,Neto,Correo electrónico del remitente,Correo electrónico del destinatario,Id. de transacción,Dirección de envío,Estado de la dirección,Nombre del artículo,Id. del artículo,Importe de envío y manipulación,Importe del seguro,Impuesto sobre ventas,Nombre de la opción 1,Valor de la opción 1,Nombre de la opción 2,Valor de la opción 2,Id. de referencia de la transacción,N.° de formato de pago,Número personalizado,Cantidad,Id.del formato de pago,Saldo,Dirección,Dirección (continuación)/Distrito/Barrio,Población o Ciudad,Estado/Provincia/Región/Condado/Territorio/Prefectura/República,Código postal,País,Número de teléfono de contacto,Asunto,Nota,Código de país,Repercusiones en el saldo
		${dateTime1.date},${dateTime1.time},PDT,"Disney DTC LATAM, Inc.",TEST,Completado,USD,"-5,99","0,00","-5,99",josedanq100@gmail.com,CORP.DL-DSSVE@disney.com,88945731C0646752T,,No confirmada,| Disney Plus Monthly - VE - Web,0,"0,00",,"0,00",,,,,B-0Y0262488W109263R,1.00106E+12,,1,,"16,90",,,,,,,,| Disney Plus Monthly - VE - Web,,,Cargo
		${dateTime2.date},${dateTime2.time},PDT,Productora Audiovisual,TEST,Completado,USD,"698,00","-37,99","660,01",blacksheepproductions.adm@gmail.com,josedanq100@gmail.com,5JB6428572966460A,"Nedith Meynel, Borges Canario, Calle Guaicaipuro Casa 108-A, Los Teques, Los Teques, ESTADO MIRANDA, 1201, Venezuela",No confirmada,,,,,,,,,,,,,,,"676,91",Calle Guaicaipuro Casa 108-A,Los Teques,Los Teques,ESTADO MIRANDA,1201,Venezuela,4241238118,,Varios�,VE,Crédito
		${dateTime3.date},${dateTime3.time},PDT,Productora Audiovisual,TEST,Completado,USD,"698,00","-37,99","660,01",blacksheepproductions.adm@gmail.com,josedanq100@gmail.com,4L054218UK407305W,,No confirmada,,,,,,,,,,,,,,,"1.336,92",,,,,,,4241238118,,Varios �,,Crédito
		${dateTime4.date},${dateTime4.time},PDT,,TEST ,Completado,USD,"-1.320,00","0,00","-1.320,00",josedanq100@gmail.com,,54E08306FN9278418,,,,,,,,,,,,,,,,,"16,92",,,,,,,,,,,Cargo`;

		const data = await commandsModule.executeCommand('paypal', csvData);
		expect(data).toBeDefined();
	});
});