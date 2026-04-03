import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
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

class Image2TextModule {
	private geminiModels = new Map<string, GenerativeModel>();

	private getCandidateServiceUrls(): string[] {
		const configuredUrl = config.IMAGE_2_TEXT_SERVICE_URL.replace(/\/$/, '');
		const fallbacks = ['http://zentra-image-extractor:4000', 'http://local-zentra-image-extractor-1:4000', 'http://localhost:4000'];

		return [...new Set([configuredUrl, ...fallbacks].filter((url) => url.length > 0))];
	}

	private createRequestConfig(image: OCRImageInput, requestId?: string) {
		if (image.type === 'file') {
			const formData = new FormData();
			formData.append('image', image.buffer, {
				filename: image.filename || 'receipt-upload',
				contentType: image.mimeType || 'application/octet-stream',
				knownLength: image.size ?? image.buffer.length,
			});

			return {
				payload: formData,
				headers: {
					...formData.getHeaders(),
					...(requestId ? { 'x-request-id': requestId } : {}),
				},
			};
		}

		return {
			payload: { image: image.value },
			headers: {
				'Content-Type': 'application/json',
				...(requestId ? { 'x-request-id': requestId } : {}),
			},
		};
	}

	private getGeminiCandidateModels(): string[] {
		return [...new Set([config.GEMINI_RECEIPT_MODEL, 'gemini-2.0-flash', 'gemini-2.0-flash-lite'])];
	}

	private getGeminiModel(modelName: string): GenerativeModel {
		if (!config.GOOGLE_AI_API_KEY) {
			throw new AppError('Gemini OCR is not configured', 500);
		}

		const cachedModel = this.geminiModels.get(modelName);
		if (cachedModel) {
			return cachedModel;
		}

		const genAI = new GoogleGenerativeAI(config.GOOGLE_AI_API_KEY);
		const model = genAI.getGenerativeModel({ model: modelName });
		this.geminiModels.set(modelName, model);
		return model;
	}

	private isGeminiModelNotFoundError(error: unknown): boolean {
		const message = error instanceof Error ? error.message : String(error);
		return /models\/.+ is not found for API version/i.test(message);
	}

	private async resolveImageBufferForGemini(
		image: OCRImageInput,
		requestId?: string
	): Promise<{ mimeType: string; base64Data: string }> {
		if (image.type === 'file') {
			return {
				mimeType: image.mimeType || 'application/octet-stream',
				base64Data: image.buffer.toString('base64'),
			};
		}

		try {
			const response = await axios.get<ArrayBuffer>(image.value, {
				responseType: 'arraybuffer',
				timeout: 60_000,
				headers: requestId ? { 'x-request-id': requestId } : undefined,
			});
			const headerType = response.headers['content-type'];
			const mimeType = typeof headerType === 'string' ? headerType.split(';')[0].trim() : 'image/jpeg';

			return {
				mimeType,
				base64Data: Buffer.from(response.data).toString('base64'),
			};
		} catch (error) {
			logger.warn('Gemini OCR image source fetch failed', {
				requestId,
				imageSource: image.value,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
			throw new AppError('Unable to load image for Gemini OCR', 422);
		}
	}

	private normalizeGeminiText(text: string): string {
		const markdownMatch = text.match(/^```(?:text|plaintext|json)?\s*([\s\S]*?)\s*```$/i);
		return markdownMatch ? markdownMatch[1].trim() : text.trim();
	}

	private async extractTextWithGemini(image: OCRImageInput, requestId?: string): Promise<OCRExtractResult> {
		try {
			const { mimeType, base64Data } = await this.resolveImageBufferForGemini(image, requestId);
			const prompt = [
				'Extract all visible text from this receipt image.',
				'Return plain text only, line by line, without markdown fences or explanations.',
			].join(' ');

			const candidateModels = this.getGeminiCandidateModels();
			let lastError: unknown = null;

			for (const modelName of candidateModels) {
				try {
					const model = this.getGeminiModel(modelName);
					const result = await model.generateContent([
						{ text: prompt },
						{
							inlineData: {
								mimeType,
								data: base64Data,
							},
						},
					]);
					const response = await result.response;
					const normalizedText = this.normalizeGeminiText(response.text());

					if (!normalizedText) {
						throw new AppError('Gemini OCR returned empty text', 422);
					}

					return {
						text: normalizedText,
						metadata: { capturedAt: null, deviceModel: null, deviceMake: null },
					};
				} catch (error) {
					lastError = error;
					if (this.isGeminiModelNotFoundError(error)) {
						logger.warn('Gemini model not found, trying next fallback model', {
							requestId,
							modelName,
						});
						continue;
						}
						throw error;
					}
				}

			throw lastError || new AppError('Gemini OCR model is unavailable', 503);
		} catch (error) {
			if (error instanceof AppError) {
				throw error;
			}

			logger.error('Gemini OCR extraction failed', {
				requestId,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
			throw new AppError('Error extracting text from images', 503);
		}
	}

	private async extractTextWithOcrService(image: OCRImageInput, requestId?: string): Promise<OCRExtractResult> {
		let lastError: AxiosError | null = null;

		for (const baseUrl of this.getCandidateServiceUrls()) {
			try {
				const { payload, headers } = this.createRequestConfig(image, requestId);
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
					requestId,
					message: axiosError.message,
					responseData: axiosError.response?.data,
					status: axiosError.response?.status,
				});

				if (axiosError.response) {
					const statusCode = axiosError.response.status;
					const responseData = axiosError.response.data as { detail?: string; message?: string } | undefined;
					const detail = responseData?.detail || responseData?.message || axiosError.message || 'OCR request failed';
					throw new AppError(detail, statusCode);
				}
			}
		}

		logger.error('Error extracting text from images', {
			requestId,
			responseData: lastError?.response?.data,
			message: lastError?.message,
			status: lastError?.response?.status,
		});
		throw new AppError('Error extracting text from images', 503);
	}

	private async extractText(image: OCRImageInput, requestId?: string): Promise<OCRExtractResult> {
		if (config.RECEIPT_TEXT_PROVIDER === 'gemini') {
			return this.extractTextWithGemini(image, requestId);
		}

		if (config.RECEIPT_TEXT_PROVIDER === 'auto' && config.GOOGLE_AI_API_KEY) {
			try {
				return await this.extractTextWithGemini(image, requestId);
			} catch (error) {
				logger.warn('Gemini OCR failed, falling back to OCR service', {
					requestId,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}

		return this.extractTextWithOcrService(image, requestId);
	}

	async extractTextFromImages(images: Array<OCRImageInput | string> = [], requestId?: string): Promise<OCRExtractResult[]> {
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
			texts.push(await this.extractText(normalizedImage, requestId));
		}

		logger.info(`Texts extracted from ${texts.length} images`);

		return texts;
	}
}

export const Image2TextService = new Image2TextModule();
