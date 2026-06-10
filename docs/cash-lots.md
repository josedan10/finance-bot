# Cash Lots

## Overview

Cash Lots track cash obtained from ATM withdrawals and link later cash expenses to the specific withdrawal(s) that funded them.

Withdrawals are no longer treated as spending. Instead, each withdrawal creates a lot that behaves like a temporary cash inventory with a remaining balance.

## Data Model

### CashLot

- `id`
- `withdrawalTransactionId`
- `sourceAmount`
- `sourceCurrency`
- `destinationAmount`
- `destinationCurrency`
- `exchangeRate`
- `remainingAmount`
- `migrationStatus`
- `createdAt`
- `updatedAt`

### CashLotAllocation

- `id`
- `cashLotId`
- `expenseTransactionId`
- `allocatedAmount`
- `exchangeRate`
- `createdAt`

## Allocation Logic

1. An ATM withdrawal creates a `CashLot`.
2. Cash expenses consume available lots in FIFO order.
3. A cash expense can allocate from multiple lots if needed.
4. Each allocation stores the exact amount consumed and the exchange rate used for that lot.
5. Remaining cash is updated on the affected lot(s).

For each allocation:

```ts
sourceEquivalent = allocatedAmount / exchangeRate
```

## Examples

### Withdrawal

```ts
100 USD -> 120000 ARS @ 1200
```

Creates:

```ts
CashLot {
  sourceAmount: 100,
  sourceCurrency: 'USD',
  destinationAmount: 120000,
  destinationCurrency: 'ARS',
  exchangeRate: 1200,
  remainingAmount: 120000
}
```

### Cash Expense

If the user spends `20000 ARS`, the system consumes from the oldest available ARS cash lot(s), stores allocation records, and reduces the lot remaining amount.

## Edge Cases

- **Multiple withdrawals in the same currency**: handled with FIFO ordering.
- **Partial consumption**: the lot remains available with a reduced `remainingAmount`.
- **Full consumption**: the lot balance reaches zero and remains linked for history.
- **Expense larger than one lot**: allocates across multiple lots.
- **Cash refunds**: should be recorded as a cash inflow transaction and re-linked manually if needed.
- **Cash transaction edits**: allocation records are restored and recalculated.
- **Cash transaction deletion**: allocation records are restored to their source lots.
- **Withdrawal deletion**: blocked when the withdrawal has already funded cash expenses.
- **Insufficient cash balance**: the transaction is rejected until enough cash lots exist.

## Historical Migration

Historical withdrawals are converted into cash lots where the source and destination amounts can be inferred from existing transaction data.

If a withdrawal cannot be linked safely, it is imported as `unlinked` and excluded from automatic allocation.
