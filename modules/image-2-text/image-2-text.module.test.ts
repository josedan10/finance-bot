import axios from 'axios';
import Sinon from 'sinon';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Image2TextService as image2TextModule } from './image-2-text.module';
import { config } from '../../src/config';

jest.mock('@google/generative-ai');

type GenerativeResponse = {
	response: {
		text: () => string;
	};
};

type MockGenerativeModel = {
	generateContent: jest.Mock<Promise<GenerativeResponse>, unknown[]>;
};

const sandbox = Sinon.createSandbox();
let spyPost: Sinon.SinonStub;
let spyGet: Sinon.SinonStub;
const MockGoogleAI = GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>;

const initialProvider = config.RECEIPT_TEXT_PROVIDER;
const initialGoogleApiKey = config.GOOGLE_AI_API_KEY;
const initialGeminiModel = config.GEMINI_RECEIPT_MODEL;
const initialImage2TextUrl = config.IMAGE_2_TEXT_SERVICE_URL;

function resetGeminiModelCache() {
	(image2TextModule as unknown as { geminiModel: unknown }).geminiModel = null;
}

describe('Image2TextModule', () => {
	beforeAll(() => {
		spyPost = sandbox.stub(axios, 'post');
		spyGet = sandbox.stub(axios, 'get');
	});

	afterAll(() => {
		config.RECEIPT_TEXT_PROVIDER = initialProvider;
		config.GOOGLE_AI_API_KEY = initialGoogleApiKey;
		config.GEMINI_RECEIPT_MODEL = initialGeminiModel;
		config.IMAGE_2_TEXT_SERVICE_URL = initialImage2TextUrl;
		sandbox.restore();
	});

	afterEach(() => {
		config.RECEIPT_TEXT_PROVIDER = 'auto';
		config.GOOGLE_AI_API_KEY = 'test-google-key';
		config.GEMINI_RECEIPT_MODEL = 'gemini-1.5-flash';
		config.IMAGE_2_TEXT_SERVICE_URL = 'http://localhost:4000';
		resetGeminiModelCache();
		jest.clearAllMocks();
		sandbox.resetHistory();
		spyPost.resetBehavior();
		spyGet.resetBehavior();
	});

	it('should use Gemini first in auto mode when API key is present', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'auto';
		config.GOOGLE_AI_API_KEY = 'test-google-key';

		const model: MockGenerativeModel = {
			generateContent: jest.fn().mockResolvedValue({
				response: {
					text: () => 'Gemini first text',
				},
			}),
		};
		MockGoogleAI.prototype.getGenerativeModel.mockReturnValue(model as unknown as ReturnType<
			GoogleGenerativeAI['getGenerativeModel']
		>);
		spyGet.resolves({
			data: Buffer.from('fake-image-binary'),
			headers: { 'content-type': 'image/jpeg' },
		});
		spyPost.resolves({ data: { text: 'OCR text' } });

		const result = await image2TextModule.extractTextFromImages(['https://example.com/image.jpg']);

		expect(result).toEqual([{ text: 'Gemini first text', metadata: { capturedAt: null, deviceModel: null, deviceMake: null } }]);
		expect(model.generateContent).toHaveBeenCalled();
		sandbox.assert.notCalled(spyPost);
	});

	it('should extract text from one image successfully using OCR provider', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'ocr';
		spyPost.resolves({ data: { text: 'Lorem Ipsum text' } });

		const result = await image2TextModule.extractTextFromImages(['https://example.com/image.jpg']);

		expect(result).toEqual([{ text: 'Lorem Ipsum text', metadata: undefined }]);
	});

	it('should extract text from multiple images successfully using OCR provider', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'ocr';
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

	it('should extract text from uploaded file payload using OCR provider', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'ocr';
		spyPost.resolves({ data: { text: 'Text from file' } });

		const result = await image2TextModule.extractTextFromImages([
			{
				type: 'file',
				buffer: Buffer.from('abc'),
				mimeType: 'image/png',
				filename: 'receipt.png',
			},
		]);

		expect(result).toEqual([{ text: 'Text from file', metadata: undefined }]);
		expect(spyPost.firstCall.args[1].constructor?.name).toBe('FormData');
	});

	it('throw an error if the array is empty', async () => {
		await expect(image2TextModule.extractTextFromImages([])).rejects.toThrow('No images provided');
		sandbox.assert.notCalled(spyPost);
	});

	it('should throw error when no images are provided', async () => {
		await expect(image2TextModule.extractTextFromImages()).rejects.toThrow('No images provided');
		sandbox.assert.notCalled(spyPost);
	});

	it('should throw AppError from OCR provider when service responds with error status', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'ocr';
		spyPost.rejects({ response: { status: 503, data: 'Error 500' }, message: 'upstream failed' });

		await expect(image2TextModule.extractTextFromImages(['https://example.com/image.jpg'])).rejects.toThrow(
			'upstream failed'
		);
	});

	it('should include x-request-id header for OCR provider', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'ocr';
		spyPost.resolves({ data: { text: 'ok' } });

		await image2TextModule.extractTextFromImages(['https://example.com/image.jpg'], 'req-123');
		const configArg = spyPost.firstCall.args[2] as { headers?: Record<string, string> };
		expect(configArg.headers?.['x-request-id']).toBe('req-123');
	});

	it('should use fallback OCR URL if primary URL network call fails', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'ocr';
		config.IMAGE_2_TEXT_SERVICE_URL = 'http://primary-ocr:4000';

		spyPost.onFirstCall().rejects(new Error('network down'));
		spyPost.onSecondCall().resolves({ data: { text: 'Fallback OCR text' } });

		const result = await image2TextModule.extractTextFromImages(['https://example.com/image.jpg']);

		expect(result).toEqual([{ text: 'Fallback OCR text', metadata: undefined }]);
		expect(spyPost.callCount).toBe(2);
		expect(spyPost.firstCall.args[0]).toContain('http://primary-ocr:4000/extract-text/');
	});

	it('should throw generic extraction error when all OCR fallback URLs fail without HTTP response', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'ocr';
		spyPost.rejects(new Error('network down'));

		await expect(image2TextModule.extractTextFromImages(['https://example.com/image.jpg'])).rejects.toMatchObject({
			message: 'Error extracting text from images',
			statusCode: 503,
		});
	});

	it('should extract text using Gemini provider from image source URL', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'gemini';

		const model: MockGenerativeModel = {
			generateContent: jest.fn().mockResolvedValue({
				response: {
					text: () => 'Store\nTotal 20',
				},
			}),
		};
		MockGoogleAI.prototype.getGenerativeModel.mockReturnValue(model as unknown as ReturnType<
			GoogleGenerativeAI['getGenerativeModel']
		>);
		spyGet.resolves({
			data: Buffer.from('fake-image-binary'),
			headers: { 'content-type': 'image/jpeg' },
		});

		const result = await image2TextModule.extractTextFromImages(['https://example.com/image.jpg'], 'req-gemini');

		expect(result).toEqual([{ text: 'Store\nTotal 20', metadata: { capturedAt: null, deviceModel: null, deviceMake: null } }]);
		expect(model.generateContent).toHaveBeenCalled();
		sandbox.assert.calledOnce(spyGet);
		sandbox.assert.notCalled(spyPost);

		const [urlArg, requestConfig] = spyGet.firstCall.args as [string, { headers?: Record<string, string> }];
		expect(urlArg).toBe('https://example.com/image.jpg');
		expect(requestConfig.headers?.['x-request-id']).toBe('req-gemini');
	});

	it('should remove markdown wrapper returned by Gemini provider', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'gemini';

		const model: MockGenerativeModel = {
			generateContent: jest.fn().mockResolvedValue({
				response: {
					text: () => '```text\nStore ABC\nTotal 44\n```',
				},
			}),
		};
		MockGoogleAI.prototype.getGenerativeModel.mockReturnValue(model as unknown as ReturnType<
			GoogleGenerativeAI['getGenerativeModel']
		>);
		spyGet.resolves({
			data: Buffer.from('fake-image-binary'),
			headers: { 'content-type': 'image/jpeg' },
		});

		const result = await image2TextModule.extractTextFromImages(['https://example.com/image.jpg']);

		expect(result).toEqual([{ text: 'Store ABC\nTotal 44', metadata: { capturedAt: null, deviceModel: null, deviceMake: null } }]);
	});

	it('should throw when Gemini provider receives empty text result', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'gemini';

		const model: MockGenerativeModel = {
			generateContent: jest.fn().mockResolvedValue({
				response: {
					text: () => '  ',
				},
			}),
		};
		MockGoogleAI.prototype.getGenerativeModel.mockReturnValue(model as unknown as ReturnType<
			GoogleGenerativeAI['getGenerativeModel']
		>);
		spyGet.resolves({
			data: Buffer.from('fake-image-binary'),
			headers: { 'content-type': 'image/jpeg' },
		});

		await expect(image2TextModule.extractTextFromImages(['https://example.com/image.jpg'])).rejects.toMatchObject({
			message: 'Gemini OCR returned empty text',
			statusCode: 422,
		});
	});

	it('should throw when Gemini provider is selected but API key is missing', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'gemini';
		config.GOOGLE_AI_API_KEY = '';
		spyGet.resolves({
			data: Buffer.from('fake-image-binary'),
			headers: { 'content-type': 'image/jpeg' },
		});

		await expect(image2TextModule.extractTextFromImages(['https://example.com/image.jpg'])).rejects.toMatchObject({
			message: 'Gemini OCR is not configured',
			statusCode: 500,
		});
	});

	it('should throw when Gemini provider cannot fetch image source URL', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'gemini';
		spyGet.rejects(new Error('fetch failed'));

		await expect(image2TextModule.extractTextFromImages(['https://example.com/image.jpg'])).rejects.toMatchObject({
			message: 'Unable to load image for Gemini OCR',
			statusCode: 422,
		});
	});

	it('should use Gemini provider with uploaded file payload', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'gemini';

		const model: MockGenerativeModel = {
			generateContent: jest.fn().mockResolvedValue({
				response: {
					text: () => 'Text from file',
				},
			}),
		};
		MockGoogleAI.prototype.getGenerativeModel.mockReturnValue(model as unknown as ReturnType<
			GoogleGenerativeAI['getGenerativeModel']
		>);

		const result = await image2TextModule.extractTextFromImages([
			{
				type: 'file',
				buffer: Buffer.from('abc'),
				mimeType: 'image/png',
				filename: 'receipt.png',
			},
		]);

		expect(result).toEqual([{ text: 'Text from file', metadata: { capturedAt: null, deviceModel: null, deviceMake: null } }]);
		sandbox.assert.notCalled(spyGet);
		expect(model.generateContent).toHaveBeenCalled();
	});

	it('should throw generic extraction error when Gemini generation fails unexpectedly', async () => {
		config.RECEIPT_TEXT_PROVIDER = 'gemini';
		spyGet.resolves({
			data: Buffer.from('fake-image-binary'),
			headers: { 'content-type': 'image/jpeg' },
		});

		const model: MockGenerativeModel = {
			generateContent: jest.fn().mockRejectedValue(new Error('gemini down')),
		};
		MockGoogleAI.prototype.getGenerativeModel.mockReturnValue(model as unknown as ReturnType<
			GoogleGenerativeAI['getGenerativeModel']
		>);

		await expect(image2TextModule.extractTextFromImages(['https://example.com/image.jpg'])).rejects.toMatchObject({
			message: 'Error extracting text from images',
			statusCode: 503,
		});
	});
});
