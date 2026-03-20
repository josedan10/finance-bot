# Controllers

## Name & Purpose
**Name:** Finance Bot Controllers
**Purpose:** Handles the application's incoming HTTP and Telegram requests, executes business logic using modules, and sends responses back to the client.

## Architecture & Design Decisions
- **Express-Based:** Standard Express.js controllers using `(req, res)` signature.
- **Direct DB Access (Prisma):** Controllers often interact directly with the `PrismaModule` for straightforward database queries, keeping the logic simple and direct.
- **Service Delegation:** For complex tasks (e.g., budget rollovers, command processing, AI chat), controllers delegate work to specialized modules or services.
- **Domain-Based Organization:** Controllers are grouped by resource or platform (e.g., `categories`, `paymentMethods`, `telegram`, `ai-assistant`).

## Key Functions/Logic
- **Resource Management:** `getCategories`, `createCategory`, `updateCategory`, and `deleteCategory` provide standard CRUD operations for financial categories and their keywords.
- **Ownership Verification:** Controllers consistently verify that the authenticated user owns the resources (e.g., categories, transactions) they are attempting to access or modify.
- **Transaction-Safe Operations:** Use `prisma.$transaction` for multi-step database operations to maintain data integrity (e.g., when deleting a category and moving its transactions to 'Other').
- **Telegram Webhook:** `TelegramController.handleWebhook` acts as the entry point for all Telegram bot interactions.

## Interactions
- **Routes:** Imported and used by the `RouterApp` (`routes/router.ts`) and platform-specific routers.
- **Modules:** Interact with `PrismaModule`, `BudgetRollover`, `CommandsModule`, and `AIAssistantModule`.
- **Middleware:** Depend on `requireAuth` to populate `req.user`.

## Important Notes/Gotchas
- **Error Handling:** Standardized `try-catch` blocks are used with centralized logging (`logger.error`) and standard HTTP status codes.
- **Data Enrichment:** Some controllers (like `getCategories`) enrich basic database results with computed values (e.g., `currentCarryOver` from `BudgetRollover`).
- **Implicit Default Category:** `deleteCategory` ensures that a default "Other" category exists before re-assigning transactions, preventing data loss.
