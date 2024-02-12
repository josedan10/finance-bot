import nock from 'nock';
import { Image2TextService as image2TextModule } from './image-2-text.module.js';
import axios from 'axios';
import Sinon from 'sinon';

describe('Image2TextModule', () => {
	it('should extract text from one image successfully', async () => {
		const getTextSuccess = nock(`${process.env.IMAGE_2_TEXT_SERVICE_URL}`)
			.post('/extract-text', { image: 'https://example.com/image.jpg' })
			.reply(200, { text: 'Lorem Ipsum text' });

		// Call the extractTextFromImages method with one image URL
		const result = await image2TextModule.extractTextFromImages(['https://example.com/image.jpg']);

		// Assert that the result is an array with one element containing the extracted text
		expect(result).toEqual(['Lorem Ipsum text']);
		getTextSuccess.done();
	});

	// extracts text from multiple images successfully
	it('should extract text from multiple images successfully', async () => {
		const getTextSuccess = nock(`${process.env.IMAGE_2_TEXT_SERVICE_URL}`)
			.post('/extract-text', { image: 'https://example.com/image1.jpg' })
			.reply(200, { text: 'Lorem ipsum' })
			.post('/extract-text', { image: 'https://example.com/image2.jpg' })
			.reply(200, { text: 'Lorem ipsum' });
		// Call the extractTextFromImages method with multiple image URLs
		const result = await image2TextModule.extractTextFromImages([
			'https://example.com/image1.jpg',
			'https://example.com/image2.jpg',
		]);

		// Assert that the result is an array with two elements containing the extracted text
		expect(result).toEqual(['Lorem ipsum', 'Lorem ipsum']);

		// Assert that axios.post was called twice with the correct URLs and payloads
		getTextSuccess.done();
	});

	// handles empty array of image urls gracefully
	it('throw an error if the array is empty', async () => {
		// mock the axios.post method
		axios.post = Sinon.stub().throws('No images provided');

		// Assert that the result is an empty array
		await expect(image2TextModule.extractTextFromImages([])).rejects.toThrow('No images provided');

		// Assert that axios.post was not called
		Sinon.assert.notCalled(axios.post);
	});

	// throws error when no images are provided
	it('should throw error when no images are provided', async () => {
		axios.post = Sinon.stub().throws('No images provided');

		// Call the extractTextFromImages method without providing any image URLs
		await expect(image2TextModule.extractTextFromImages()).rejects.toThrow('No images provided');

		// Assert that axios.post was not called
		Sinon.assert.notCalled(axios.post);
	});

	// throws error when image to text service is down or unavailable
	it('should throw error when image to text service is down or unavailable', async () => {
		// mock the axios.post method
		axios.post = Sinon.stub().throws({ response: { data: 'Error 500' } });

		// Call the extractTextFromImages method with one image URL
		await expect(image2TextModule.extractTextFromImages(['https://example.com/image.jpg'])).rejects.toThrow(
			'Error extracting text from images'
		);

		// Assert that axios.post was called with the correct URL and payload
		Sinon.assert.calledOnce(axios.post);
	});
});
