# Excel Module

## Name & Purpose
**Name:** ExcelModule
**Purpose:** Handles parsing of CSV and Excel data, converting it into machine-readable JavaScript arrays. It specifically deals with formatting quirks like commas inside quoted strings.

## Architecture & Design Decisions
- **Custom Parsing Logic:** Uses regex and string manipulation to handle CSV parsing instead of a third-party library, providing control over row headers and quoted values.
- **Handling Commas:** Correctly handles CSV files where fields might contain commas by temporarily replacing them with `&comma;` if they are within quotes.
- **Row Shifting:** Allows skipping a configurable number of header rows.
- **Minimal Dependencies:** Keeps external dependency footprint low by implementing custom parsing logic.

## Key Functions/Logic
- `parseCSVDataToJs(csvData: string, shiftCount: number = 1)`: Splits CSV content into rows and columns, cleaning up carriage returns and removing headers.
- **Regex Replacement:** `row.replace(regex, (match) => { ... })` ensures that commas within double-quoted fields don't cause incorrect column splitting.

## Interactions
- **Modules:** Used by `MercantilPanama` and `PayPal` modules to process uploaded CSV files before registering them as transactions in the database.

## Important Notes/Gotchas
- **Escaping:** Commas inside quoted fields are replaced with `&comma;`. If these values are displayed back or saved elsewhere, they may need to be un-escaped if the final destination doesn't handle them.
- **Performance:** For very large CSV files, splitting the entire content by `\n` into memory can be resource-intensive. For small to medium finance reports, this approach is efficient enough.
- **Quote Handling:** Assumes standard CSV quoting with double quotes (`"`).
