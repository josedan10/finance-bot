# Commands Module

## Name & Purpose
**Name:** CommandsModule
**Purpose:** This module acts as a central command registry and executor for the finance bot. It maps command names (strings) to specific asynchronous functions that perform various operations like registering transactions from CSV data (Mercantil, PayPal), generating reports, or extracting data from images.

## Architecture & Design Decisions
- **Command Registry:** Commands are defined in an internal `commands` object, allowing for easy expansion.
- **Dynamic Execution:** The `executeCommand` method dynamically calls the appropriate function based on the command string, making the system flexible and decoupling the command source (e.g., Telegram, API) from the implementation.
- **Input Flexibility:** Commands accept `data` of type `unknown` and a `userId`, allowing each command to define its own input structure (e.g., `RegisterTransactionInput`).
- **Singleton Pattern:** The module is exported as a singleton (`default new CommandsModule()`), ensuring a consistent command registry across the application.

## Key Functions/Logic
- `executeCommand(command: string, data: unknown, userId: number)`: Validates if the command exists and executes it with the provided data and user context.
- `commands.registerTransaction`: A complex command that uses `Image2TextService` to extract text from images and `BaseTransactions` to register a transaction, returning a formatted success message.
- `commands.mercantil` / `commands.paypal`: Triggers bulk transaction registration from CSV data using specialized modules.
- `commands.monthlyReport`: Fetches and formats a monthly financial report.

## Interactions
- **Modules:** Interacts with `Image2TextService`, `BaseTransactions`, `MercantilPanama`, `PayPal`, and `Reports`.
- **Controllers:** Typically called by the `TelegramController` to process incoming user commands from the chat bot.

## Important Notes/Gotchas
- **Hardcoded Definitions:** Some command descriptions are hardcoded in `publishedCommandsDefinitions` for use in the Telegram help menu.
- **User Context:** Most commands default `userId` to `1` if not provided, which might need to be carefully handled in multi-user environments.
- **Error Handling:** Throws an error if a command is not found, which should be caught by the caller to provide user feedback.
