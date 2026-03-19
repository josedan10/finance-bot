import axios, { AxiosError } from 'axios';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';

class Image2TextModule {
	/**
	 * Extracts text from images.
	 * Supports both URLs and Base64 encoded images.
	 */
	async extractTextFromImages(images: string[] = []): Promise<string[]> {
		if (!images.length) throw new Error('No images provided');

		const texts: string[] = [];

		try {
			for (const image of images) {
				// The Python service expects either a URL or a Base64 string in the 'image' field
				const response = await axios.post(
					`${config.IMAGE_2_TEXT_SERVICE_URL}/extract-text`,
					{ image },
					{ 
						headers: { 'Content-Type': 'application/json' },
						maxContentLength: Infinity,
						maxBodyLength: Infinity 
					}
				);

				texts.push(response.data.text);
			}
		} catch (error: unknown) {
			const errorResponse = error as AxiosError;
			logger.error('Error extracting text from images', { 
				responseData: errorResponse?.response?.data,
				message: errorResponse.message 
			});
			throw new Error('Error extracting text from images');
		}

		logger.info(`Texts extracted from ${texts.length} images`);

		return texts;
	}
}

export const Image2TextService = new Image2TextModule();
