import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

import { PrismaModule as prisma } from './database.module';

jest.mock('./database.module', () => ({
	__esModule: true,
	PrismaModule: mockDeep<PrismaClient>(),
}));

beforeEach(() => {
	mockReset(prismaMock);
});

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
