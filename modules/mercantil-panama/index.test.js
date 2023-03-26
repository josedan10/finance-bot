import dayjs from 'dayjs';
import { MercantilPanama } from './index.js';

describe('Mercantil Panamá Module: ', () => {
	const exampleCSVData = `"Mercantil Banco, Sistema de Banca por Internet",,,,
  Fecha,Descripción,No. de Referencia,Débito,Crédito
  03/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/385571/TEST3        0 021,385571,,5.09
  02/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/386352/TEST2        0 021,386352,2.08,
  01/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/391248/TEST1        0 021,391248,4.63,`;

	test('Register 3 transactions sucessfully', async () => {
		const data = await MercantilPanama.registerMercantilTransactionsFromCSVData(exampleCSVData);
		expect(data).toHaveLength(3);
		expect(data[0].type).toBe('credit');
		expect(data[1].type).toBe('debit');
	});
	test('Register 0 transactions', async () => {
		const data =
			await MercantilPanama.registerMercantilTransactionsFromCSVData(`"Mercantil Banco, Sistema de Banca por Internet",,,,
    Fecha,Descripción,No. de Referencia,Débito,Crédito`);
		expect(data).toHaveLength(0);
	});
});
