import { telegramService } from '../../src/services/telegram.service';
import commandsModule from '../../modules/commands/commands.module';
import telegramBot from '../../modules/telegram/telegram.module';
import Sinon from 'sinon';

describe('TelegramService', () => {
  let sandbox: Sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = Sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should handle standard text command', async () => {
    const chatId = 123;
    const message = { text: '/testCommand arg1' };

    sandbox.stub(telegramBot, 'commandParser').returns({ commandName: 'testCommand', commandArgs: ['arg1'] });
    sandbox.stub(commandsModule, 'executeCommand').resolves('Command Executed');
    const sendMsgStub = sandbox.stub(telegramBot, 'sendMessage').resolves();

    await telegramService.handleWebhookMessage(chatId, message);

    sandbox.assert.calledWith(sendMsgStub, 'Command Executed', chatId);
  });

  it('should send generic fallback when no command or caption is understood', async () => {
    const chatId = 123;
    const message = { text: 'Hello bot' };

    const sendMsgStub = sandbox.stub(telegramBot, 'sendMessage').resolves();

    await telegramService.handleWebhookMessage(chatId, message);

    sandbox.assert.calledWith(sendMsgStub, "I don't understand you", chatId);
  });

  it('should handle a registerTransaction command with no photos gracefully', async () => {
    const chatId = 123;
    const message = { caption: '/registerTransaction', photo: [] };

    sandbox.stub(telegramBot, 'commandParser').returns({ commandName: 'registerTransaction', commandArgs: [] });

    // Explicitly stub executeCommand so we control its behavior if accidentally called
    sandbox.stub(commandsModule, 'executeCommand').resolves('Success');
    // Ensure the commandsList lookup works correctly
    sandbox.stub(commandsModule, 'commandsList').value({ registerTransaction: 'registerTransaction' });

    const sendMsgStub = sandbox.stub(telegramBot, 'sendMessage').resolves();

    await telegramService.handleWebhookMessage(chatId, message);

    sandbox.assert.calledWith(sendMsgStub, 'No photos found in message', chatId);
  });

  it('should handle a registerTransaction command with photos', async () => {
    const chatId = 123;
    const message = {
      caption: '/registerTransaction 10',
      photo: [{ file_size: 100, file_id: 'small' }, { file_size: 500, file_id: 'large' }]
    };

    sandbox.stub(telegramBot, 'commandParser').returns({ commandName: 'registerTransaction', commandArgs: ['10'] });
    sandbox.stub(commandsModule, 'commandsList').value({ registerTransaction: 'registerTransaction' });

    sandbox.stub(telegramBot, 'getFilePath').resolves({ result: { file_path: 'path/to/img.jpg' } } as any);
    sandbox.stub(commandsModule, 'executeCommand').resolves('Photo processed');
    const sendMsgStub = sandbox.stub(telegramBot, 'sendMessage').resolves();

    await telegramService.handleWebhookMessage(chatId, message);

    sandbox.assert.calledWith(sendMsgStub, 'Photo processed', chatId);
  });

  it('should handle document uploads gracefully when no document attached', async () => {
    const chatId = 123;
    const message = { caption: '/otherCommand', document: {} };

    sandbox.stub(telegramBot, 'commandParser').returns({ commandName: 'otherCommand', commandArgs: [] });
    sandbox.stub(commandsModule, 'commandsList').value({ registerTransaction: 'registerTransaction' });

    const sendMsgStub = sandbox.stub(telegramBot, 'sendMessage').resolves();

    await telegramService.handleWebhookMessage(chatId, message);

    sandbox.assert.calledWith(sendMsgStub, 'No document found in message', chatId);
  });

  it('should process valid document payloads', async () => {
    const chatId = 123;
    const message = { caption: '/importCommand', document: { file_id: 'doc123' } };

    sandbox.stub(telegramBot, 'commandParser').returns({ commandName: 'importCommand', commandArgs: [] });
    sandbox.stub(commandsModule, 'commandsList').value({ registerTransaction: 'registerTransaction' });

    sandbox.stub(telegramBot, 'getFilePath').resolves({ result: { file_path: 'docs/test.csv' } } as any);
    sandbox.stub(telegramBot, 'getFileContent').resolves('csv content');
    sandbox.stub(commandsModule, 'executeCommand').resolves('Document imported');

    const sendMsgStub = sandbox.stub(telegramBot, 'sendMessage').resolves();

    await telegramService.handleWebhookMessage(chatId, message);

    sandbox.assert.calledWith(sendMsgStub, 'Document imported', chatId);
  });
});
