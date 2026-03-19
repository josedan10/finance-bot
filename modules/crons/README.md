# Crons Module

## Purpose
Orchestrates background tasks, scheduled jobs, and asynchronous queue processing.

## Architecture & Design Decisions
The module is built around two concepts:
1. **Scheduled Jobs (`node-cron`)**: Time-based triggers (e.g., daily at 9 AM).
2. **Task Queue (`TaskQueue` DB table)**: A persistent queue for jobs that might fail and need retries (e.g., fetching exchange rates when the external API is down).
- **Why?** Separating the trigger from the execution allows the system to be fault-tolerant. If the PyDolar API goes down, the task stays in the queue and is retried later, rather than just failing silently until the next day.

## Key Tasks
- `updateExchangeRate`: Scrapes the latest BCV and Monitor rates via `scraper-api-pydolar` and stores them in the DB.
- `checkGmailEmails`: Polls the connected Gmail accounts for unread transaction emails and feeds them into the `base-transactions` parsing engine.
- `updateTransactionsTable`: A cleanup job that retroactively updates USD amounts for pending VES transactions once the daily exchange rate becomes available.

## Interactions
- **External APIs**: Gmail, PyDolar.
- **Internal Modules**: `telegram` (for error alerting to admins), `base-transactions` (for data ingestion).
