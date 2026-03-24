import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { buildSshArgs, runSshConnectivityCheck, type SpawnLike } from './test-digitalocean-ssh';

function createMockChildProcess(): ChildProcessWithoutNullStreams {
	const child = new EventEmitter() as ChildProcessWithoutNullStreams;
	child.stdout = new EventEmitter() as ChildProcessWithoutNullStreams['stdout'];
	child.stderr = new EventEmitter() as ChildProcessWithoutNullStreams['stderr'];
	child.stdin = new EventEmitter() as ChildProcessWithoutNullStreams['stdin'];
	child.kill = jest.fn() as ChildProcessWithoutNullStreams['kill'];

	return child;
}

describe('test-digitalocean-ssh', () => {
	it('builds ssh args with defaults', () => {
		expect(
			buildSshArgs(
				{
					host: '1.2.3.4',
				},
				'echo ok'
			)
		).toEqual([
			'-o',
			'BatchMode=yes',
			'-o',
			'ConnectTimeout=10',
			'-o',
			'StrictHostKeyChecking=accept-new',
			'-p',
			'22',
			'root@1.2.3.4',
			'echo ok',
		]);
	});

	it('builds ssh args with custom options', () => {
		expect(
			buildSshArgs(
				{
					host: '1.2.3.4',
					username: 'deploy',
					port: 2222,
					sshKeyPath: '/tmp/key.pem',
				},
				'echo ok'
			)
		).toEqual([
			'-o',
			'BatchMode=yes',
			'-o',
			'ConnectTimeout=10',
			'-o',
			'StrictHostKeyChecking=accept-new',
			'-p',
			'2222',
			'-i',
			'/tmp/key.pem',
			'deploy@1.2.3.4',
			'echo ok',
		]);
	});

	it('fails when host is missing', async () => {
		await expect(
			runSshConnectivityCheck(
				{
					host: '',
				},
				jest.fn() as never
			)
		).rejects.toThrow('DO_HOST environment variable is required');
	});

	it('resolves when ssh exits successfully', async () => {
		const child = createMockChildProcess();
		const spawnMock = jest.fn<SpawnLike>().mockReturnValue(child);

		const promise = runSshConnectivityCheck(
			{
				host: '1.2.3.4',
			},
			spawnMock
		);

		child.stdout.emit('data', Buffer.from('connected:droplet:user=root'));
		child.emit('close', 0);

		await expect(promise).resolves.toBeUndefined();
		expect(spawnMock).toHaveBeenCalled();
	});

	it('rejects when ssh exits with an error', async () => {
		const child = createMockChildProcess();
		const spawnMock = jest.fn<SpawnLike>().mockReturnValue(child);

		const promise = runSshConnectivityCheck(
			{
				host: '1.2.3.4',
			},
			spawnMock
		);

		child.stderr.emit('data', Buffer.from('Permission denied'));
		child.emit('close', 255);

		await expect(promise).rejects.toThrow('Permission denied');
	});
});
