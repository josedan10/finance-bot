# Notifications Module

## Purpose
The `NotificationsModule` is a comprehensive system for managing user alerts, specifically focused on budget threshold notifications. It monitors spending against category limits and notifies users when they reach predefined spending levels (e.g., 50%, 80%, 100% of their budget).

## Architecture & Design Decisions
- **Factory Pattern**: The `NotificationFactory` serves as the central orchestrator. It instantiates and manages specialized services for different notification channels and business logic.
- **Pluggable Channels**: Designed to support multiple notification methods (currently Email and WebPush) through a common `INotificationService` interface.
- **Preference-Driven**: A dedicated `NotificationPreferenceService` manages user settings, allowing granular control over which notifications are received and through which channels.
- **Stateful Tracking**: Uses a `NotificationLog` in the database to record sent notifications, which can be used for deduplication and audit trails.

## Key Functions & Algorithms
- `notifyBudgetThreshold(userId, categoryId, transactionAmount)`:
    1. **Preference Validation**: Checks global and category-specific notification settings.
    2. **Threshold Detection**: Invokes `BudgetCheckerService` to determine if the latest transaction caused spending to cross any budget thresholds.
    3. **Spending Calculation**: Aggregates all transactions for the current month in the given category to calculate the current percentage of the budget used.
    4. **Multi-Channel Dispatch**: Sends alerts via all enabled and available channels (Email, WebPush).
- **Budget Checking Algorithm**: Compares the sum of transactions in the current calendar month against the `amountLimit` defined in the `Category` model.

## Interactions
- **Database (Prisma)**: Extensive use for querying transactions, categories, user profiles, and preferences.
- **Email Service**: Integrates with email providers to send formatted budget alerts.
- **WebPush Service**: Utilizes the Web Push API to send browser-based notifications to subscribed devices.
- **External Triggers**: Typically called by the transaction creation/update flow in other modules.

## Important Notes/Gotchas
- **Monthly Reset**: Budget tracking is strictly aligned with the calendar month.
- **Category Limits**: Notifications will only trigger for categories that have a non-zero `amountLimit` set.
- **Async Execution**: Ideally, these notifications should be triggered asynchronously to avoid delaying the main transaction registration flow.
- **Deduplication**: The system should be checked for logic that prevents multiple notifications for the same threshold crossing within the same month (handled via `NotificationLog` and logic in `BudgetCheckerService`).
