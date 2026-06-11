# Cash Lots

## Overview

Cash Lots track cash obtained from ATM withdrawals and link later cash expenses to the specific withdrawal(s) that funded them.

Withdrawals are no longer treated as spending. Instead, each withdrawal creates a lot that behaves like a temporary cash inventory with a remaining balance.

## Data Model

### CashLot

| Field | Type | Description |
| --- | --- | --- |
| `id` | `number` | Unique identifier for the cash lot. |
| `userId` | `number` | Tenant identifier for multi-tenant isolation. |
| `withdrawalTransactionId` | `number \| null` | Linked withdrawal transaction. |
| `withdrawalDate` | `ISO8601 timestamp` | Date used for FIFO ordering. |
| `sourceAmount` | `number` | Original source currency amount withdrawn from the account. |
| `sourceCurrency` | `string` | Source currency code, usually the account currency. |
| `destinationAmount` | `number` | Cash amount received in the destination currency. |
| `destinationCurrency` | `string` | Destination currency code for the cash lot. |
| `exchangeRate` | `number` | Exchange rate applied when the lot was created. |
| `remainingAmount` | `number` | Unused destination currency still available in the lot. |
| `migrationStatus` | `linked \| unlinked` | `linked` means the withdrawal was safely associated with a lot and can be used in automatic allocation. `unlinked` means the record could not be safely associated, so it is excluded from automatic allocation and downstream cash consumption. |
| `createdAt` | `ISO8601 timestamp` | Timestamp when the lot was created. |
| `updatedAt` | `ISO8601 timestamp` | Timestamp when the lot was last updated. |

### CashLotAllocation

| Field | Type | Description |
| --- | --- | --- |
| `id` | `number` | Unique identifier for the allocation record. |
| `userId` | `number` | Tenant identifier for multi-tenant isolation. |
| `cashLotId` | `number` | Foreign key to the cash lot that funded the expense. |
| `expenseTransactionId` | `number` | Linked expense transaction. |
| `allocatedAmount` | `number` | Amount of destination currency consumed from the lot. |
| `exchangeRate` | `number` | Exchange rate applied at allocation time. |
| `createdAt` | `ISO8601 timestamp` | Timestamp when the allocation was created. |

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
- **Cash refunds**: record the refund as a cash inflow transaction and relink manually if needed.
- **When editing a cash transaction**: restore the previous allocation records and recalculate them from the updated expense.
- **On deletion of a cash transaction**: restore allocation records to their source lots before removing the transaction.
- **Withdrawal deletion**: blocked when the withdrawal has already funded cash expenses.
- **Insufficient cash balance**: the transaction is rejected until enough cash lots exist.

## Historical Migration

Historical withdrawals are converted into cash lots where the source and destination amounts can be inferred from existing transaction data.

If a withdrawal cannot be linked safely, it is imported as `unlinked` and excluded from automatic allocation.
