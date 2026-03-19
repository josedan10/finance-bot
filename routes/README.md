# Routes

## Name & Purpose
**Name:** Finance Bot API Router
**Purpose:** Defines the application's URL structure, applies security middleware, and maps endpoints to their corresponding controller functions.

## Architecture & Design Decisions
- **Centralized Router:** `router.ts` acts as the main hub, while sub-routers like `telegramRouter` and `aiAssistantRouter` handle platform-specific logic.
- **Middleware-First:** Authentication (`requireAuth`) and role-based access control (`requireRole`) are applied as middleware before reaching the controllers.
- **RESTful Endpoints:** Endpoints are organized following REST conventions (e.g., `/api/transactions`, `/api/categories`).
- **CORS Configuration:** Built-in CORS handling to allow requests from the React frontend.
- **Auth Syncing:** Specialized `/api/auth/signup` endpoint to sync Firebase authentication with the local database.

## Key Functions/Logic
- **Transaction Handling:** Endpoints for fetching, creating (single/bulk), deleting, and categorizing transactions.
- **Budgeting & Notifications:** APIs for managing budget limits and notification preferences (thresholds, email/web-push settings).
- **Exchange Rates:** Provides access to the latest BCV and Monitor exchange rates, with automatic conversion for VES-based transactions.
- **Test Cleanup:** `/api/auth/cleanup-test-user` provides a secure way to wipe test data from both Firebase and the database during E2E testing.

## Interactions
- **Controllers:** Calls functions from `CategoryController`, `PaymentMethodController`, and other service modules.
- **Middleware:** Heavily relies on `requireAuth`, `requireRole`, and `firebaseAdmin`.
- **Frontend:** Provides the primary API interface for the `finance-bot-ui` application.

## Important Notes/Gotchas
- **Implicit Currency Conversion:** POST `/api/transactions` automatically converts VES amounts to USD using the latest available exchange rate if not already provided.
- **Backward Compatibility:** Some endpoints (like `/api/categories/keywords`) are kept for compatibility with older frontend versions.
- **Global Error Handling:** While most routes have local error handling, unhandled exceptions are generally caught by the main Express app wrapper.
