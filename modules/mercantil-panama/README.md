# Mercantil Panama Module

## Purpose
The `MercantilPanamaModule` is responsible for processing transaction data from Mercantil Panama bank CSV exports and registering them into the system.

## Architecture & Design Decisions
- **Singleton Instance**: The module exports a single instance of `MercantilPanamaModule`.
- **Dependency Integration**: It integrates with the `excelModule` for parsing CSV data, the `database` module for fetching system entities, and the `base-transactions` module for standardized transaction creation.
- **Service Layer**: Acts as a specialized service for handling bank-specific data formats.

## Key Functions & Algorithms
- `registerMercantilTransactionsFromCSVData(data: string, userId: number)`:
  - **Parsing**: Uses `excelModule.parseCSVDataToJs` to convert the raw CSV string into a usable array, skipping headers.
  - **Date Parsing**: Splits the date string and uses `MONTHS_TO_NUMBERS` mapping to construct a JavaScript `Date` object.
  - **Categorization Algorithm**: Iterates through the user's categories and their associated keywords. If a keyword is found in the transaction description (case-insensitive), that category is assigned.
  - **Transaction Creation**: Iteratively calls `BaseTransactions.safeCreateTransaction` to ensure transactions are created safely, avoiding duplicates via `referenceId`.

## Interactions
- **excelModule**: For raw CSV data parsing.
- **Prisma (Database Module)**: To fetch `paymentMethod` and `category` (with keywords) information.
- **BaseTransactions**: To persist the processed transactions.

## Important Notes/Gotchas
- **CSV Format**: Assumes a specific column structure (0: date, 1: description, 2: referenceId, 3: debit, 4: credit).
- **Hardcoded Currency**: All transactions are currently registered with 'USD' as the currency.
- **Default User**: If no `userId` is provided, it defaults to 1.
- **Month Mapping**: Relies on a specific mapping for month names (e.g., 'ENE', 'FEB') which must be present in `src/enums/months.ts`.
