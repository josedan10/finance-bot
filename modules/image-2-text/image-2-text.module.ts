import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
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

class Image2TextModule {
	private getCandidateServiceUrls(): string[] {
		const configuredUrl = config.IMAGE_2_TEXT_SERVICE_URL.replace(/\/$/, '');
		return [
			...new Set([
				configuredUrl,
				'http://zentra-image-extractor:4000',
				'http://local-zentra-image-extractor-1:4000',
				'http://localhost:4000',
			]),
		];
	}

	private createRequestConfig(image: OCRImageInput) {
		if (image.type === 'file') {
			const formData = new FormData();
			formData.append('image', image.buffer, {
				filename: image.filename || 'receipt-upload',
				contentType: image.mimeType || 'application/octet-stream',
				knownLength: image.size ?? image.buffer.length,
			});

			return {
				payload: formData,
				headers: formData.getHeaders(),
			};
		}

		return {
			payload: { image: image.value },
			headers: { 'Content-Type': 'application/json' },
		};
	}

	private async extractText(image: OCRImageInput): Promise<OCRExtractResult> {
		let lastError: AxiosError | null = null;

		for (const baseUrl of this.getCandidateServiceUrls()) {
			try {
				const { payload, headers } = this.createRequestConfig(image);
				const response = await axios.post(`${baseUrl}/extract-text/`, payload, {
					headers,
					maxContentLength: Infinity,
					maxBodyLength: Infinity,
					timeout: 60_000,
				});

				if (baseUrl !== config.IMAGE_2_TEXT_SERVICE_URL.replace(/\/$/, '')) {
					logger.warn('OCR service fallback URL used', { baseUrl });
				}

				return {
					text: response.data.text,
					metadata: response.data.metadata,
				};
			} catch (error: unknown) {
				const axiosError = error as AxiosError;
				lastError = axiosError;
				logger.warn('OCR extraction attempt failed', {
					baseUrl,
					message: axiosError.message,
					responseData: axiosError.response?.data,
					status: axiosError.response?.status,
				});
			}
		}

		logger.error('Error extracting text from images', {
			responseData: lastError?.response?.data,
			message: lastError?.message,
			status: lastError?.response?.status,
		});
		throw new Error('Error extracting text from images');
	}

	async extractTextFromImages(images: Array<OCRImageInput | string> = []): Promise<OCRExtractResult[]> {
		if (!images.length) throw new Error('No images provided');

		const texts: OCRExtractResult[] = [];

		for (const image of images) {
			const normalizedImage: OCRImageInput =
				typeof image === 'string'
					? {
							type: 'image-source',
							value: image,
						}
					: image;
			texts.push(await this.extractText(normalizedImage));
		}

		logger.info(`Texts extracted from ${texts.length} images`);

		return texts;
	}
}

export const Image2TextService = new Image2TextModule();
