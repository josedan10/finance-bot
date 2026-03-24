import { spawn } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';
import logger from '../src/lib/logger';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface DigitalOceanSshConfig {
	host: string;
	username?: string;
	port?: number;
	sshKeyPath?: string;
}

export type SpawnLike = (
	command: string,
	args: string[],
	options: {
		stdio: 'pipe';
	}
) => ReturnType<typeof spawn>;

export function buildSshArgs(config: DigitalOceanSshConfig, remoteCommand: string): string[] {
	const args = [
		'-o',
		'BatchMode=yes',
		'-o',
		'ConnectTimeout=10',
		'-o',
		'StrictHostKeyChecking=accept-new',
		'-p',
		String(config.port ?? 22),
	];

	if (config.sshKeyPath) {
		args.push('-i', config.sshKeyPath);
	}

	args.push(`${config.username ?? 'root'}@${config.host}`, remoteCommand);

	return args;
}

export async function runSshConnectivityCheck(
	config: DigitalOceanSshConfig,
	spawnFn: SpawnLike = spawn
): Promise<void> {
	if (!config.host) {
		throw new Error('DO_HOST environment variable is required');
	}

	const remoteCommand = 'printf "connected:" && hostname && printf ":user=" && whoami';
	const args = buildSshArgs(config, remoteCommand);

	await new Promise<void>((resolve, reject) => {
		const child = spawnFn('ssh', args, {
			stdio: 'pipe'
		});

		let stdout = '';
		let stderr = '';

		child.stdout?.on('data', (chunk) => {
			stdout += chunk.toString();
		});

		child.stderr?.on('data', (chunk) => {
			stderr += chunk.toString();
		});

		child.on('error', (error) => {
			reject(error);
		});

		child.on('close', (code) => {
			if (code === 0) {
				logger.info('SSH connectivity check succeeded', {
					host: config.host,
					output: stdout.trim(),
				});
				resolve();
				return;
			}

			reject(new Error(stderr.trim() || `SSH connectivity check failed with exit code ${code ?? 'unknown'}`));
		});
	});
}

export async function main(): Promise<number> {
	try {
		await runSshConnectivityCheck({
			host: process.env.DO_HOST ?? '',
			username: process.env.DO_USERNAME,
			port: process.env.DO_SSH_PORT ? Number(process.env.DO_SSH_PORT) : undefined,
			sshKeyPath: process.env.DO_SSH_KEY_PATH,
		});

		return 0;
	} catch (error) {
		logger.error('SSH connectivity check failed', error);
		return 1;
	}
}

if (require.main === module) {
	main().then((exitCode) => {
		process.exit(exitCode);
	});
}
