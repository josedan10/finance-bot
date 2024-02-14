import axios from 'axios';

class Image2TextModule {
	async extractTextFromImages(imagesUrls = []) {
		if (!imagesUrls.length) throw new Error('No images provided');

		const texts = [];

		try {
			for (const image of imagesUrls) {
				const response = await axios.post(
					`${process.env.IMAGE_2_TEXT_SERVICE_URL}/extract-text`,
					{
						image,
					},
					{
						headers: {
							'Content-Type': 'application/json',
						},
					}
				);

				texts.push(response.data.text);
			}
		} catch (error) {
			console.error(error.response.data);
			throw new Error('Error extracting text from images');
		}

		console.log(`Texts extracted from images: ${texts}`);

		return texts;
	}
}

export const Image2TextService = new Image2TextModule();
