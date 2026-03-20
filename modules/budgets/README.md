# Budgets Module

## Purpose
Manages budget limits, tracks monthly spending periods, and handles the logic for cumulative (carry-over) budgets.

## Architecture & Design Decisions
Uses a **"Snapshot Ledger" (Just-In-Time) approach**. Instead of running a heavy midnight cron job on the 1st of every month to calculate all budgets, the system creates a `BudgetPeriod` snapshot the moment a transaction or report is requested for that month.
- **Why?** This "lazy" or JIT evaluation is much more resilient. It doesn't rely on the server being up at exactly midnight, and it naturally handles users who might not log in for months at a time without processing empty periods unnecessarily.

## Key Functions & Algorithms
### 1. JIT Period Creation (`getOrCreateCurrentPeriod`)
Checks if a `BudgetPeriod` exists for the requested month/year. If not, it creates one.
- **Concurrency**: Wrapped in a try-catch block relying on the DB's unique constraint (`categoryId_year_month`) to gracefully handle race conditions if multiple concurrent requests try to create the period.

### 2. Rollover Math (`calculateRollover`)
For categories flagged as `isCumulative = true`:
- Looks up the previous month's `BudgetPeriod`.
- Formula: `(Base Limit + Previous CarryOver) - Previous Spent = New Surplus`.
- Enforces a floor of `0` (deficits are not carried over, only surpluses).

## Interactions
- **Database (`PrismaModule`)**: For tracking periods and categories.
- **Notifications (`BudgetCheckerService`)**: Provides the "Effective Limit" (Base + CarryOver) so alerts trigger accurately.
