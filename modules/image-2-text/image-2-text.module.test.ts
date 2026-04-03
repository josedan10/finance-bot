import { Image2TextService as image2TextModule } from './image-2-text.module';
import { config } from '../../src/config';
import axios from 'axios';
import Sinon from 'sinon';

const sandbox = Sinon.createSandbox();
let spyPost: Sinon.SinonStub;
let savedApiKey: string;

describe('Image2TextModule (local service fallback)', () => {
	beforeAll(() => {
		// Force local service path regardless of CI environment
		savedApiKey = config.GOOGLE_AI_API_KEY;
		config.GOOGLE_AI_API_KEY = '';
		config.IMAGE_2_TEXT_SERVICE_URL = 'http://localhost:3000';

		spyPost = sandbox.stub(axios, 'post');
	});

	afterAll(() => {
		config.GOOGLE_AI_API_KEY = savedApiKey;
		sandbox.restore();
	});

	afterEach(() => {
		sandbox.resetHistory();
		spyPost.resetBehavior();
	});

	it('should extract text from one image successfully', async () => {
		spyPost.resolves({ data: { text: 'Lorem Ipsum text' } });

		const result = await image2TextModule.extractTextFromImages(['https://example.com/image.jpg']);

		expect(result).toEqual([{ text: 'Lorem Ipsum text', metadata: undefined }]);
	});

	it('should extract text from multiple images successfully', async () => {
		spyPost.resolves({ data: { text: 'Lorem ipsum' } });

		const result = await image2TextModule.extractTextFromImages([
			'https://example.com/image1.jpg',
			'https://example.com/image2.jpg',
		]);

		expect(result).toEqual([
			{ text: 'Lorem ipsum', metadata: undefined },
			{ text: 'Lorem ipsum', metadata: undefined },
		]);
	});

	it('should throw error if the array is empty', async () => {
		await expect(image2TextModule.extractTextFromImages([])).rejects.toThrow('No images provided');
		sandbox.assert.notCalled(spyPost);
	});

	it('should throw error when no images are provided', async () => {
		await expect(image2TextModule.extractTextFromImages()).rejects.toThrow('No images provided');
		sandbox.assert.notCalled(spyPost);
	});

	it('should throw error when image to text service is down', async () => {
		spyPost.rejects(new Error('connect ECONNREFUSED 127.0.0.1:3000'));

		await expect(image2TextModule.extractTextFromImages(['https://example.com/image.jpg'])).rejects.toThrow(
			'connect ECONNREFUSED 127.0.0.1:3000'
		);
	});

	it('should throw error on network failure', async () => {
		spyPost.rejects(new Error('network down'));

		await expect(image2TextModule.extractTextFromImages(['https://example.com/image.jpg'])).rejects.toThrow(
			'network down'
		);
	});
});
