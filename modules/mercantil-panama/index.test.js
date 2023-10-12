import dayjs from 'dayjs';
import { MercantilPanama } from './index.js';
import Sinon from 'sinon';
import prisma from '../database/database.module.js';

describe('Mercantil Panamá Module: ', () => {
	const exampleCSVData = `"Mercantil Banco, Sistema de Banca por Internet",,,,
  Fecha,Descripción,No. de Referencia,Débito,Crédito
  03/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/385571/TEST3        0 021,385571,,5.09
  02/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/386352/TEST2        0 021,386352,2.08,
  01/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/391248/TEST1        0 021,391248,4.63,`;

	afterEach(function () {
		Sinon.restore();
	});

	test('Register 3 transactions sucessfully', async () => {
		prisma.$transaction = Sinon.stub().resolves([
			{ id: 1, type: 'credit' },
			{ id: 2, type: 'debit' },
			{ id: 3, type: 'debit' },
		]);
		prisma.paymentMethod.findUnique = Sinon.stub().resolves({ id: 1 });
		prisma.transaction.create = Sinon.stub().resolves({ id: 1 });
		prisma.category.findMany = Sinon.stub().resolves([{ id: 1 }]);

		const data = await MercantilPanama.registerMercantilTransactionsFromCSVData(exampleCSVData);

		Sinon.assert.calledOnce(prisma.paymentMethod.findUnique);
		Sinon.assert.calledOnce(prisma.category.findMany);
		Sinon.assert.calledOnce(prisma.$transaction);

		expect(data).toHaveLength(3);
		expect(data[0].type).toBe('credit');
		expect(data[1].type).toBe('debit');
	});
	test('Register 0 transactions', async () => {
		prisma.$transaction = Sinon.stub().resolves([]);
		prisma.paymentMethod.findUnique = Sinon.stub().resolves({ id: 1 });
		prisma.transaction.create = Sinon.stub().resolves({ id: 1 });
		prisma.category.findMany = Sinon.stub().resolves([{ id: 1 }]);

		const data =
			await MercantilPanama.registerMercantilTransactionsFromCSVData(`"Mercantil Banco, Sistema de Banca por Internet",,,,
    Fecha,Descripción,No. de Referencia,Débito,Crédito`);

		Sinon.assert.calledOnce(prisma.paymentMethod.findUnique);
		Sinon.assert.calledOnce(prisma.$transaction);
		Sinon.assert.calledOnce(prisma.category.findMany);
		expect(data).toHaveLength(0);
	});
});
