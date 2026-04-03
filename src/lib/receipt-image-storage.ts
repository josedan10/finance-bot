import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../config';
import logger from './logger';
import type sharp from 'sharp';

type StoredReceiptImage = {
	fileName: string;
	filePath: string;
	publicUrl: string;
};

type SharpFactory = typeof sharp;

let cachedSharpFactory: SharpFactory | null | undefined;

async function getSharpFactory(): Promise<SharpFactory | null> {
	if (cachedSharpFactory !== undefined) {
		return cachedSharpFactory;
	}

	try {
		const sharpModule = await import('sharp');
		cachedSharpFactory = (sharpModule.default ?? sharpModule) as SharpFactory;
	} catch (error) {
		cachedSharpFactory = null;
		logger.warn('Sharp unavailable; OCR image optimization disabled for this process', { error });
	}

	return cachedSharpFactory;
}

export type OptimizedReceiptImage = {
	buffer: Buffer;
	mimeType: string;
	compressionIterations: number;
	compressionQuality: number | null;
	targetMaxBytes: number | null;
	targetReached: boolean;
	originalBytes: number;
	optimizedBytes: number;
	originalWidth: number | null;
	originalHeight: number | null;
	optimizedWidth: number | null;
	optimizedHeight: number | null;
	originalFormat: string | null;
	optimizedFormat: string | null;
	didOptimize: boolean;
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

export async function optimizeReceiptImageForOcr(buffer: Buffer): Promise<OptimizedReceiptImage> {
	const originalBytes = buffer.length;
	const targetMaxBytes = config.RECEIPT_OCR_TARGET_MAX_BYTES;
	const initialQuality = config.RECEIPT_OCR_JPEG_QUALITY;
	const minQuality = Math.min(initialQuality, config.RECEIPT_OCR_MIN_JPEG_QUALITY);
	const qualityStep = 7;
	const sharpFactory = await getSharpFactory();

	if (!sharpFactory) {
		return {
			buffer,
			mimeType: 'application/octet-stream',
			compressionIterations: 0,
			compressionQuality: null,
			targetMaxBytes,
			targetReached: false,
			originalBytes,
			optimizedBytes: originalBytes,
			originalWidth: null,
			originalHeight: null,
			optimizedWidth: null,
			optimizedHeight: null,
			originalFormat: null,
			optimizedFormat: null,
			didOptimize: false,
		};
	}

	try {
		const rotatedPipeline = sharpFactory(buffer, { failOn: 'none' }).rotate();
		const metadata = await rotatedPipeline.metadata();
		const resizedBuffer = await rotatedPipeline
			.resize({
				width: config.RECEIPT_OCR_MAX_IMAGE_DIMENSION,
				height: config.RECEIPT_OCR_MAX_IMAGE_DIMENSION,
				fit: 'inside',
				withoutEnlargement: true,
			})
			.toBuffer();

		let compressionIterations = 0;
		let quality = initialQuality;
		let optimizedBuffer = await sharpFactory(resizedBuffer, { failOn: 'none' })
			.jpeg({
				quality,
				mozjpeg: true,
			})
			.toBuffer();

		while (optimizedBuffer.length > targetMaxBytes && quality > minQuality) {
			const nextQuality = Math.max(minQuality, quality - qualityStep);
			if (nextQuality === quality) {
				break;
			}

			quality = nextQuality;
			compressionIterations += 1;
			optimizedBuffer = await sharpFactory(resizedBuffer, { failOn: 'none' })
				.jpeg({
					quality,
					mozjpeg: true,
				})
				.toBuffer();
		}

		const optimizedMetadata = await sharpFactory(optimizedBuffer, { failOn: 'none' }).metadata();
		const targetReached = optimizedBuffer.length <= targetMaxBytes;

		return {
			buffer: optimizedBuffer,
			mimeType: 'image/jpeg',
			compressionIterations,
			compressionQuality: quality,
			targetMaxBytes,
			targetReached,
			originalBytes,
			optimizedBytes: optimizedBuffer.length,
			originalWidth: metadata.width ?? null,
			originalHeight: metadata.height ?? null,
			optimizedWidth: optimizedMetadata.width ?? null,
			optimizedHeight: optimizedMetadata.height ?? null,
			originalFormat: metadata.format ?? null,
			optimizedFormat: optimizedMetadata.format ?? null,
			didOptimize: true,
		};
	} catch (error) {
		logger.warn('Failed to optimize receipt image for OCR; using original buffer', {
			error,
			originalBytes,
		});

		return {
			buffer,
			mimeType: 'application/octet-stream',
			compressionIterations: 0,
			compressionQuality: null,
			targetMaxBytes: null,
			targetReached: false,
			originalBytes,
			optimizedBytes: originalBytes,
			originalWidth: null,
			originalHeight: null,
			optimizedWidth: null,
			optimizedHeight: null,
			originalFormat: null,
			optimizedFormat: null,
			didOptimize: false,
		};
	}
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
