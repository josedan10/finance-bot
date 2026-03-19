# Telegram Module

## Purpose
The `TelegramBot` module serves as the primary interface between the finance bot application and the Telegram Bot API. It encapsulates the complexities of HTTP communication, file uploads, and message formatting for the Telegram platform.

## Architecture & Design Decisions
- **Singleton Export**: The module provides a single instance of `TelegramBot` for system-wide use.
- **Generic API Wrapper**: A centralized `sendRequest` method handles the heavy lifting of `axios` configuration and error handling for multiple Telegram API methods.
- **Media Handling**: Specialized support for `multipart/form-data` allows the bot to send local images (like charts or receipt processing results) and retrieve user-uploaded files.
- **Modular Configuration**: Uses specific URL constants (`TELEGRAM_BOT_URL`, `TELEGRAM_FILE_URL`) to allow for flexible deployment environments.

## Key Functions & Algorithms
- `sendMessage(message, chatId)`: Sends a plain text message to a specific Telegram chat.
- `sendImage(imagePath, caption, chatId)`: 
    - **Stream-based Upload**: Uses `fs.createReadStream` to efficiently upload images without loading the entire file into memory.
    - **Sanitization**: Includes an algorithm to sanitize captions for use as filenames in the multi-part form data.
- `getFileContent(filePath)`: Downloads the raw content of a file from Telegram's servers.
- `commandParser(commandString)`: 
    - **Parsing Algorithm**: Splits a string like `/report march` into its components: `commandName` ("report") and `commandArgs` (["march"]).

## Interactions
- **Telegram Bot API**: External dependency for all communication.
- **axios**: HTTP client for API requests.
- **form-data**: Utility for constructing complex multi-part requests.
- **Local Filesystem (fs)**: Required for reading images that are to be sent via the bot.

## Important Notes/Gotchas
- **Token Dependency**: Requires `TELEGRAM_BOT_TOKEN` to be correctly set in the environment variables.
- **Error Handling**: Most methods catch errors and log them via the system logger, returning `void` or a response with `ok: false` on failure. Callers must handle these cases.
- **Webhook Configuration**: Includes a `setWebhook` method which is critical for the initial bot setup in production environments.
- **Command Prefix**: `commandParser` strictly expects commands to start with the `/` character.
