import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';

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

class Image2TextModule {
	private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

	constructor() {
		const genAI = new GoogleGenerativeAI(config.GOOGLE_AI_API_KEY);
		this.model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
	}

	private async resolveInlineData(image: OCRImageInput): Promise<{ data: string; mimeType: string }> {
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

	private async extractText(image: OCRImageInput): Promise<OCRExtractResult> {
		const inlineData = await this.resolveInlineData(image);

		const result = await this.model.generateContent([
			RECEIPT_OCR_PROMPT,
			{ inlineData },
		]);

		const text = result.response.text().trim();

		if (!text) {
			throw new Error('No text found in the image. Try to improve the image quality.');
		}

		return {
			text,
			metadata: { capturedAt: null, deviceModel: null, deviceMake: null },
		};
	}

	async extractTextFromImages(images: Array<OCRImageInput | string> = []): Promise<OCRExtractResult[]> {
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
				logger.error('OCR extraction failed', { message });
				throw new Error(message);
			}
		}

		logger.info(`Texts extracted from ${texts.length} images`);

		return texts;
	}
}

export const Image2TextService = new Image2TextModule();
