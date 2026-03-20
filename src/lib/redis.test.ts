jest.unmock('./redis');
jest.unmock('../../src/lib/redis');

const mockSet = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('redis', () => ({
	createClient: jest.fn(() => ({
		isOpen: false,
		on: jest.fn(),
		connect: mockConnect.mockImplementation(function (this: { isOpen?: boolean }) {
			this.isOpen = true;
			return Promise.resolve();
		}),
		get: jest.fn(),
		set: mockSet,
		del: jest.fn(),
		disconnect: mockDisconnect.mockImplementation(function (this: { isOpen?: boolean }) {
			this.isOpen = false;
			return Promise.resolve();
		}),
	})),
}));

describe('RedisService', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should set a value with TTL using node-redis v5 options object syntax', async () => {
		const { redisClient } = await import('./redis');
		mockSet.mockResolvedValueOnce('OK');

		await redisClient.set('cache:key', 'value', { EX: 3600 });

		expect(mockSet).toHaveBeenCalledWith('cache:key', 'value', { EX: 3600 });
		await redisClient.disconnect();
	});

	it('should set a lock with NX and EX using node-redis v5 options object syntax', async () => {
		const { redisClient } = await import('./redis');
		mockSet.mockResolvedValueOnce('OK');

		const result = await redisClient.set('cron:daily-task', '1', { NX: true, EX: 3600 });

		expect(mockSet).toHaveBeenCalledWith('cron:daily-task', '1', { NX: true, EX: 3600 });
		expect(result).toBe('OK');
		await redisClient.disconnect();
	});
});
