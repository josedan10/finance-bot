import { promises as fs } from 'fs';
import path from 'path';
import logger from './logger';

type StoredReceiptImage = {
	fileName: string;
	filePath: string;
	publicUrl: string;
};

export function getImageExtension(mimeType: string | undefined, originalName: string | undefined): string {
	if (mimeType === 'image/png') return '.png';
	if (mimeType === 'image/webp') return '.webp';
	if (mimeType === 'image/heic') return '.heic';
	if (mimeType === 'image/heif') return '.heif';

	const originalExtension = originalName ? path.extname(originalName).toLowerCase() : '';
	if (originalExtension) {
		return originalExtension;
	}

	return '.jpg';
}

function sanitizeLabel(value: string): string {
	const sanitized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
	return sanitized || 'receipt';
}

export async function saveReceiptProcessingImage(params: {
	buffer: Buffer;
	originalName?: string;
	mimeType?: string;
	requestId: string;
	baseUrl: string;
	label?: string;
}): Promise<StoredReceiptImage> {
	const receiptProcessingDir = path.resolve(process.cwd(), 'public', 'receipt-processing');
	const extension = getImageExtension(params.mimeType, params.originalName);
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const label = sanitizeLabel(params.label || 'scan');
	const fileName = `${timestamp}-${label}-${params.requestId}${extension}`;
	const filePath = path.join(receiptProcessingDir, fileName);

	await fs.mkdir(receiptProcessingDir, { recursive: true });
	await fs.writeFile(filePath, params.buffer);

	return {
		fileName,
		filePath,
		publicUrl: `${params.baseUrl}/receipt-processing/${fileName}`,
	};
}

export async function cleanupOldReceiptProcessingImages(maxAgeHours: number): Promise<{ deletedCount: number }> {
	const receiptProcessingDir = path.resolve(process.cwd(), 'public', 'receipt-processing');
	const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
	const cutoff = Date.now() - maxAgeMs;

	try {
		const files = await fs.readdir(receiptProcessingDir);
		let deletedCount = 0;

		for (const fileName of files) {
			const filePath = path.join(receiptProcessingDir, fileName);
			const stats = await fs.stat(filePath);

			if (!stats.isFile()) {
				continue;
			}

			if (stats.mtimeMs < cutoff) {
				await fs.unlink(filePath);
				deletedCount += 1;
			}
		}

		return { deletedCount };
	} catch (error: unknown) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError.code === 'ENOENT') {
			return { deletedCount: 0 };
		}

		logger.error('Failed to clean receipt processing images', { error });
		throw error;
	}
}
