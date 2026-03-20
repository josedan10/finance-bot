import axios, { AxiosError } from 'axios';
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

class Image2TextModule {
	private getCandidateServiceUrls(): string[] {
		const configuredUrl = config.IMAGE_2_TEXT_SERVICE_URL.replace(/\/$/, '');
		return [...new Set([configuredUrl, 'http://zentra-image-extractor:4000', 'http://local-zentra-image-extractor-1:4000', 'http://localhost:4000'])];
	}

	private async extractText(image: string): Promise<OCRExtractResult> {
		let lastError: AxiosError | null = null;

		for (const baseUrl of this.getCandidateServiceUrls()) {
			try {
				const response = await axios.post(
					`${baseUrl}/extract-text/`,
					{ image },
					{
						headers: { 'Content-Type': 'application/json' },
						maxContentLength: Infinity,
						maxBodyLength: Infinity,
					}
				);

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
				});
			}
		}

		logger.error('Error extracting text from images', {
			responseData: lastError?.response?.data,
			message: lastError?.message,
		});
		throw new Error('Error extracting text from images');
	}

	/**
	 * Extracts text from images.
	 * Supports both URLs and Base64 encoded images.
	 */
	async extractTextFromImages(images: string[] = []): Promise<OCRExtractResult[]> {
		if (!images.length) throw new Error('No images provided');

		const texts: OCRExtractResult[] = [];

		for (const image of images) {
			texts.push(await this.extractText(image));
		}

		logger.info(`Texts extracted from ${texts.length} images`);

		return texts;
	}
}

export const Image2TextService = new Image2TextModule();
