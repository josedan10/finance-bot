# Cash Lots Update

## What changed

- ATM withdrawals now create cash lots.
- Cash expenses consume available cash lots instead of acting as standalone balances.
- The app now stores allocation breakdowns for cash spending.
- Withdrawal and cash expense screens show lot balance, rate, and linked transactions.

## Why withdrawals are no longer expenses

Withdrawals move money from an account into a cash wallet. The spending happens later, when the cash is used.

## How cash is now tracked

- Every withdrawal creates a lot with:
  - source amount
  - destination cash amount
  - exchange rate
  - remaining amount
- Every cash expense consumes one or more lots using FIFO.
- Each consumption is stored as an allocation record.

## How exchange rates are applied

- The withdrawal saves the exchange rate used at the moment of withdrawal.
- Cash expenses inherit the exchange rate from the lot(s) they consume.
- The app preserves the source-currency equivalent for each allocation.

## What users need to know

- Mark ATM operations as **cash withdrawals**.
- Enter the cash amount received and the exchange rate.
- Enter cash expenses normally so the system can consume the right lots.
- If a cash expense is edited or deleted, the linked lots are restored automatically.
