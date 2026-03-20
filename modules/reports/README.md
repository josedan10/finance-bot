# Reports Module

## Purpose
The `ReportsModule` is responsible for generating aggregated financial summaries from the transaction data, providing users with a clear view of their spending and income patterns on a monthly basis.

## Architecture & Design Decisions
- **Singleton Export**: The module is exported as a singleton instance called `Reports`.
- **Raw SQL for Performance**: Utilizes Prisma's `$queryRaw` to perform complex aggregations (SUM, CASE WHEN, GROUP BY) directly in the database, which is more efficient for reporting than fetching and processing thousands of records in memory.
- **Markdown-First Formatting**: Includes internal utilities to format raw data into human-readable Markdown tables, making it ideal for integration with messaging platforms like Telegram.

## Key Functions & Algorithms
- `getMonthlyReport(monthDate: string)`: 
    - **Aggregation Algorithm**: Executes a SQL query that calculates `total_debits`, `total_credits`, and `category_balance` per category for a specific month.
    - **Dynamic Filtering**: Calculates the date range for the requested month using SQL date functions.
- `reportMessageOnMarkdown(reportData: ReportRow[])`: 
    - Orchestrates the creation of a summary message, including global totals and a detailed per-category table.
- `buildMarkdownTable(columns, rows)`: 
    - A utility function that calculates maximum column widths and generates a perfectly aligned Markdown table.

## Interactions
- **Database (Prisma)**: Directly queries the `Transaction` and `Category` tables using raw SQL.
- **dayjs**: Used for date manipulation in the JavaScript layer.

## Important Notes/Gotchas
- **Database Dialect**: The SQL syntax (`DATE_ADD`, `INTERVAL 1 MONTH`, `DATE_FORMAT`) is specific to **MySQL/MariaDB**. It will fail if used with PostgreSQL or SQLite without modification.
- **Security/Privacy Risk**: The current implementation of `getMonthlyReport` **lacks a `userId` filter**. This means it may aggregate transactions from ALL users if the database is multi-tenant. This should be addressed by adding `WHERE t.userId = ${userId}`.
- **Year Assumption**: If only a month is provided, it assumes the current calendar year.
- **Category Grouping**: Transactions without a category will be grouped together (via `LEFT JOIN`), but their display name might be null if not handled specifically in the UI/Message layer.
