# Base Transactions Module

## Purpose
The core engine for registering, validating, and persisting financial transactions from various ingestion channels (Manual, OCR/Images, CSV, and Email).

## Architecture & Design Decisions
This module acts as a **centralized gatekeeper**. Instead of having each ingestion method write directly to the database, they all funnel through `BaseTransactions.safeCreateTransaction`.
- **Why?** To ensure that business rules (like deduplication and currency conversion) are uniformly applied regardless of how the transaction entered the system.

## Key Functions & Algorithms
### 1. Fuzzy Deduplication (`findDuplicate`)
A sophisticated algorithm to prevent double-counting expenses (e.g., a user manually enters a coffee, and later a bank CSV import includes the same coffee).
- **Primary Check**: Exact `referenceId` match (highest confidence).
- **Fuzzy Check**: 
  - Exact amount match.
  - Date within a ±2 Day window (accounts for bank settlement delays).
  - **Keyword Overlap**: Analyzes the description strings. If at least 1-2 significant words overlap (e.g., "McDonalds"), it is flagged as a duplicate.

### 2. Multi-Currency Handling (`_VESToUSDWithExchangeRateByDate`)
Handles the conversion of Venezuelan Bolívares (VES) to USD using historical exchange rates.
- **Logic**: Checks the execution hour. If before 9:00 AM, it uses the previous day's rate (as official rates haven't updated yet). Handles weekend fallback logic.

### 3. Auto-Categorization (`findCategoryByWords`)
Maps transaction descriptions to user categories using a keyword database.
- **Optimization**: Uses Redis (`RedisModule`) to cache user keywords, drastically reducing database load during bulk CSV imports or heavy email processing.

## Interactions
- **Database (`PrismaModule`)**: For all CRUD operations.
- **Crons (`ExchangeCurrencyCronServices`)**: To fetch historical rates.
- **Notifications (`NotificationFactory`)**: To trigger budget alerts synchronously after a transaction is created.
- **Redis (`RedisModule`)**: For keyword caching.
