import { Image2TextService as image2TextModule } from './image-2-text.module';
import { config } from '../../src/config';
import axios from 'axios';
import Sinon from 'sinon';

// Must be declared before jest.mock so the factory can reference it
const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
	GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
		getGenerativeModel: jest.fn().mockReturnValue({
			generateContent: mockGenerateContent,
		}),
	})),
}));

const sandbox = Sinon.createSandbox();
let spyPost: Sinon.SinonStub;
let spyGet: Sinon.SinonStub;
let savedApiKey: string;
let savedServiceUrl: string;

beforeAll(() => {
	savedApiKey = config.GOOGLE_AI_API_KEY;
	savedServiceUrl = config.IMAGE_2_TEXT_SERVICE_URL;
	spyPost = sandbox.stub(axios, 'post');
	spyGet = sandbox.stub(axios, 'get');
});

afterAll(() => {
	config.GOOGLE_AI_API_KEY = savedApiKey;
	config.IMAGE_2_TEXT_SERVICE_URL = savedServiceUrl;
	sandbox.restore();
});

afterEach(() => {
	sandbox.resetHistory();
	spyPost.resetBehavior();
	spyGet.resetBehavior();
	mockGenerateContent.mockReset();
});

// ---------------------------------------------------------------------------
// Local service fallback path
// ---------------------------------------------------------------------------

describe('Image2TextModule (local service fallback)', () => {
	beforeEach(() => {
		config.GOOGLE_AI_API_KEY = '';
		config.IMAGE_2_TEXT_SERVICE_URL = 'http://localhost:3000';
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

	it('should extract text from a file buffer (FormData path)', async () => {
		spyPost.resolves({ data: { text: 'receipt text', metadata: { capturedAt: null } } });

		const result = await image2TextModule.extractTextFromImages([
			{ type: 'file', buffer: Buffer.from('fake-image'), mimeType: 'image/jpeg' },
		]);

		expect(result).toEqual([{ text: 'receipt text', metadata: { capturedAt: null } }]);
		const formDataArg = spyPost.firstCall.args[1];
		expect(formDataArg.constructor.name).toBe('FormData');
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

	it('should throw error when no OCR provider is configured', async () => {
		config.IMAGE_2_TEXT_SERVICE_URL = '';

		await expect(image2TextModule.extractTextFromImages(['https://example.com/image.jpg'])).rejects.toThrow(
			'No OCR provider configured'
		);
	});
});

// ---------------------------------------------------------------------------
// Gemini Vision path
// ---------------------------------------------------------------------------

describe('Image2TextModule (Gemini path)', () => {
	beforeEach(() => {
		config.GOOGLE_AI_API_KEY = 'test-api-key';
		config.IMAGE_2_TEXT_SERVICE_URL = '';
	});

	it('should extract text from a file buffer via Gemini', async () => {
		mockGenerateContent.mockResolvedValue({ response: { text: () => 'Extracted via Gemini' } });

		const result = await image2TextModule.extractTextFromImages([
			{ type: 'file', buffer: Buffer.from('fake-image'), mimeType: 'image/png' },
		]);

		expect(result).toEqual([{ text: 'Extracted via Gemini', metadata: { capturedAt: null, deviceModel: null, deviceMake: null } }]);
		expect(mockGenerateContent).toHaveBeenCalledTimes(1);
	});

	it('should fetch image URL and send to Gemini', async () => {
		spyGet.resolves({
			data: Buffer.from('fake-image').buffer,
			headers: { 'content-type': 'image/jpeg' },
		});
		mockGenerateContent.mockResolvedValue({ response: { text: () => 'Receipt text from URL' } });

		const result = await image2TextModule.extractTextFromImages(['https://example.com/receipt.jpg']);

		expect(result).toEqual([{ text: 'Receipt text from URL', metadata: { capturedAt: null, deviceModel: null, deviceMake: null } }]);
		sandbox.assert.calledOnce(spyGet);
	});

	it('should throw when Gemini returns empty text', async () => {
		mockGenerateContent.mockResolvedValue({ response: { text: () => '' } });

		await expect(
			image2TextModule.extractTextFromImages([{ type: 'file', buffer: Buffer.from('img'), mimeType: 'image/jpeg' }])
		).rejects.toThrow('No text found in the image');
	});
});
