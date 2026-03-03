import commandsModule from '../../modules/commands/commands.module';
import telegramBot from '../../modules/telegram/telegram.module';
import { TELEGRAM_FILE_URL } from '../telegram/variables';
import logger from '../lib/logger';

export class TelegramService {
  public async handleWebhookMessage(chatId: number, message: any): Promise<void> {
    let commandResponse;
    let command;

    if (message.text && message.text[0] === '/') {
      command = telegramBot.commandParser(message.text);
      commandResponse = await commandsModule.executeCommand(command.commandName, command.commandArgs);
      await telegramBot.sendMessage(commandResponse, chatId);
      return;
    }

    if (message.caption && message.caption[0] === '/') {
      command = telegramBot.commandParser(message.caption);

      if (command.commandName === commandsModule.commandsList.registerTransaction) {
        logger.info('Transaction receipt received');
        const photos = message.photo;

        if (!photos?.length) {
          await telegramBot.sendMessage('No photos found in message', chatId);
          return;
        }

        const bestPhoto = photos.sort(
          (a: { file_size: number }, b: { file_size: number }) => b.file_size - a.file_size
        )[0];

        const filePath = await telegramBot.getFilePath(bestPhoto.file_id);
        const filePathResult = (filePath as { result?: { file_path?: string } })?.result?.file_path;
        const fileUrl = `${TELEGRAM_FILE_URL}/${filePathResult}`;

        commandResponse = await commandsModule.executeCommand(command.commandName, {
          images: [fileUrl],
          telegramFileIds: [bestPhoto.file_id],
          commandArgs: command.commandArgs,
        });
      } else {
        const document = message.document;
        if (!document?.file_id) {
          await telegramBot.sendMessage('No document found in message', chatId);
          return;
        }
        const filePath = await telegramBot.getFilePath(document.file_id);
        const filePathResult = (filePath as { result?: { file_path?: string } })?.result?.file_path;
        const fileContent = await telegramBot.getFileContent(filePathResult || '');
        commandResponse = await commandsModule.executeCommand(command.commandName, fileContent);
      }

      await telegramBot.sendMessage(commandResponse, chatId);
      return;
    }

    await telegramBot.sendMessage("I don't understand you", chatId);
  }
}

export const telegramService = new TelegramService();
