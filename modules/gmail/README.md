# Gmail Module

## Purpose
Automates transaction entry by connecting to users' Gmail accounts to parse bank notifications and digital receipts.

## Architecture & Design Decisions
It uses a **Rule-Based Engine** (`email-parser-rules.ts`). 
- **Why?** Different banks and services have vastly different email formats. A rigid parser would break constantly. By defining an array of `EmailParserRule` objects, we can easily add new bank templates (regex patterns for sender, subject, amount, date) without modifying the core extraction logic.

## Key Functions & Algorithms
- `getUnreadEmails`: Connects to the Gmail API using OAuth2 and fetches messages labeled as 'UNREAD'.
- `parseEmail`: Iterates through the `emailParserRules`. The first rule that matches the sender and subject is used to extract the transaction details via Regex.
- `markAsRead`: Removes the 'UNREAD' label so the email isn't processed again.

## Interactions
- **External**: Google Gmail API.
- **Internal**: `base-transactions` (receives the parsed data to check for duplicates and save it), `database` (to track `ProcessedEmail` and avoid reprocessing).

## Important Notes/Gotchas
- **OAuth2**: Requires valid Google Cloud credentials (`credentials.json`) and user tokens (`token.json`). If tokens expire, the cron job will fail.
- **Regex Fragility**: Bank email formats change. If a rule suddenly stops working, the Regex in `email-parser-rules.ts` needs to be updated based on the new email body.
