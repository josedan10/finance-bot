import dayjs from 'dayjs';
import { MercantilPanama } from './mercantil-panama.module';
import Sinon from 'sinon';
import { PrismaModule as prisma } from '../database/database.module';
import { createCategory, createPaymentMethod } from '../../prisma/factories';
import { prismaMock } from '../database/database.module.mock';

const sandbox = Sinon.createSandbox();

describe('Mercantil Panamá Module: ', () => {
	const exampleCSVData = `"Mercantil Banco, Sistema de Banca por Internet",,,,
  Fecha,Descripción,No. de Referencia,Débito,Crédito
  03/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/385571/TEST3        0 021,385571,,5.09
  02/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/386352/TEST2        0 021,386352,2.08,
  01/ENE/2010,COMPRAS/${dayjs().format('YYYY-MM-DDTHH:mm:ssZ[Z]')}/391248/TEST1        0 021,391248,4.63,`;

	afterEach(function () {
		sandbox.restore();
		sandbox.reset();
		sandbox.resetHistory();
	});

	test('Register 3 transactions sucessfully', async () => {
		const paymentMethod = await createPaymentMethod({ id: 1 });
		const categories = [await createCategory({ id: 1 })];

		const spyPaymentMethodFindUnique = prismaMock.paymentMethod.findUnique.mockResolvedValue(paymentMethod);
		const spyCategoryFindMany = prismaMock.category.findMany.mockResolvedValue(categories);
		const spy$Transaction = prismaMock.$transaction.mockResolvedValue([
			{ id: 1, type: 'credit' },
			{ id: 2, type: 'debit' },
			{ id: 3, type: 'debit' },
		]);

		prisma.transaction.create = sandbox.stub().resolves({ id: 1 });

		const data = await MercantilPanama.registerMercantilTransactionsFromCSVData(exampleCSVData);

		expect(spyPaymentMethodFindUnique).toHaveBeenCalledTimes(1);
		expect(spyCategoryFindMany).toHaveBeenCalledTimes(1);
		expect(spy$Transaction).toHaveBeenCalledTimes(1);

		expect(data).toHaveLength(3);
		expect(data[0].type).toBe('credit');
		expect(data[1].type).toBe('debit');
	});
	test('Register 0 transactions', async () => {
		prisma.transaction.create = sandbox.stub().resolves({ id: 1 });

		const paymentMethod = await createPaymentMethod({ id: 1 });
		const categories = [await createCategory({ id: 1 })];

		const spyPaymentMethodFindUnique = prismaMock.paymentMethod.findUnique.mockResolvedValue(paymentMethod);
		const spyCategoryFindMany = prismaMock.category.findMany.mockResolvedValue(categories);
		const spy$Transaction = prismaMock.$transaction.mockResolvedValue([]);

		const data =
			await MercantilPanama.registerMercantilTransactionsFromCSVData(`"Mercantil Banco, Sistema de Banca por Internet",,,,
    Fecha,Descripción,No. de Referencia,Débito,Crédito`);

		expect(spyPaymentMethodFindUnique).toHaveBeenCalledTimes(1);
		expect(spyCategoryFindMany).toHaveBeenCalledTimes(1);
		expect(spy$Transaction).toHaveBeenCalledTimes(1);
		expect(data).toHaveLength(0);
	});
});
