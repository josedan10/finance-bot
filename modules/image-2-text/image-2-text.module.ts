import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';
import { AppError } from '../../src/lib/appError';

type OCRExtractResult = {
	text: string;
	metadata?: {
		capturedAt?: string | null;
		deviceModel?: string | null;
		deviceMake?: string | null;
	};
};

export type OCRImageInput =
	| {
			type: 'image-source';
			value: string;
	  }
	| {
			type: 'file';
			buffer: Buffer;
			filename?: string;
			mimeType?: string;
			size?: number;
	  };

const RECEIPT_OCR_PROMPT =
	'Extract all visible text from this receipt image exactly as it appears. ' +
	'Return only the raw text content, preserving line breaks. ' +
	'Do not add commentary, formatting, or explanations.';

// ---------------------------------------------------------------------------
// Gemini Vision (primary — production)
// ---------------------------------------------------------------------------

async function resolveInlineData(image: OCRImageInput): Promise<{ data: string; mimeType: string }> {
	if (image.type === 'file') {
		return {
			data: image.buffer.toString('base64'),
			mimeType: image.mimeType || 'image/jpeg',
		};
	}

	const response = await axios.get<ArrayBuffer>(image.value, {
		responseType: 'arraybuffer',
		timeout: 30_000,
	});

	const mimeType = (response.headers['content-type'] as string | undefined) || 'image/jpeg';

	return {
		data: Buffer.from(response.data).toString('base64'),
		mimeType: mimeType.split(';')[0].trim(),
	};
}

async function extractWithGemini(image: OCRImageInput): Promise<OCRExtractResult> {
	const genAI = new GoogleGenerativeAI(config.GOOGLE_AI_API_KEY);
	const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

	const inlineData = await resolveInlineData(image);
	const result = await model.generateContent([RECEIPT_OCR_PROMPT, { inlineData }]);
	const text = result.response.text().trim();

	if (!text) {
		throw new Error('No text found in the image. Try to improve the image quality.');
	}

	return { text, metadata: { capturedAt: null, deviceModel: null, deviceMake: null } };
}

// ---------------------------------------------------------------------------
// Local Python OCR service (fallback — local dev only)
// ---------------------------------------------------------------------------

async function extractWithLocalService(image: OCRImageInput, serviceUrl: string): Promise<OCRExtractResult> {
	const baseUrl = serviceUrl.replace(/\/$/, '');

	let payload: FormData | { image: string };
	let headers: Record<string, string>;

	if (image.type === 'file') {
		const formData = new FormData();
		formData.append('image', image.buffer, {
			filename: image.filename || 'receipt-upload',
			contentType: image.mimeType || 'application/octet-stream',
			knownLength: image.size ?? image.buffer.length,
		});
		payload = formData;
		headers = formData.getHeaders();
	} else {
		payload = { image: image.value };
		headers = { 'Content-Type': 'application/json' };
	}

	const response = await axios.post(`${baseUrl}/extract-text/`, payload, {
		headers,
		maxContentLength: Infinity,
		maxBodyLength: Infinity,
		timeout: 60_000,
	});

	return {
		text: response.data.text,
		metadata: response.data.metadata,
	};
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

class Image2TextModule {
	private async extractText(image: OCRImageInput): Promise<OCRExtractResult> {
		if (config.GOOGLE_AI_API_KEY) {
			return extractWithGemini(image);
		}

		if (config.IMAGE_2_TEXT_SERVICE_URL) {
			logger.warn('GOOGLE_AI_API_KEY not set — falling back to local OCR service', {
				url: config.IMAGE_2_TEXT_SERVICE_URL,
			});
			return extractWithLocalService(image, config.IMAGE_2_TEXT_SERVICE_URL);
		}

		throw new Error('No OCR provider configured. Set GOOGLE_AI_API_KEY or IMAGE_2_TEXT_SERVICE_URL.');
	}

	async extractTextFromImages(images: Array<OCRImageInput | string> = [], requestId?: string): Promise<OCRExtractResult[]> {
		if (!images.length) throw new Error('No images provided');

		const texts: OCRExtractResult[] = [];

		for (const image of images) {
			const normalizedImage: OCRImageInput =
				typeof image === 'string'
					? { type: 'image-source', value: image }
					: image;

			try {
				texts.push(await this.extractText(normalizedImage));
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				logger.error('OCR extraction failed', {
					message,
					provider: config.GOOGLE_AI_API_KEY ? 'gemini' : 'local',
					axiosStatus: (error as AxiosError)?.response?.status,
				});
				throw new Error(message);
			}
		}

		logger.info(`Texts extracted from ${texts.length} images`);

		return texts;
	}
}

export const Image2TextService = new Image2TextModule();
