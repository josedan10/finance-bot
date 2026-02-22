import axios, { AxiosError } from 'axios';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';

class Image2TextModule {
	async extractTextFromImages(imagesUrls: string[] = []): Promise<string[]> {
		if (!imagesUrls.length) throw new Error('No images provided');

		const texts: string[] = [];

		try {
			for (const image of imagesUrls) {
				const response = await axios.post(
					`${config.IMAGE_2_TEXT_SERVICE_URL}/extract-text`,
					{ image },
					{ headers: { 'Content-Type': 'application/json' } }
				);

				texts.push(response.data.text);
			}
		} catch (error: unknown) {
			const errorResponse = error as AxiosError;
			logger.error('Error extracting text from images', { responseData: errorResponse?.response?.data });
			throw new Error('Error extracting text from images', { cause: error });
		}

		logger.info(`Texts extracted from ${texts.length} images`);

		return texts;
	}
}

export const Image2TextService = new Image2TextModule();
