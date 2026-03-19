# PayPal Module

## Purpose
The `PaypalModule` is designed to ingest and process transaction data from PayPal CSV exports, automating the registration of these transactions into the finance system.

## Architecture & Design Decisions
- **Singleton Pattern**: The module is exported as a singleton instance named `PayPal`.
- **Flexible Column Mapping**: Includes a custom utility to convert Excel-style column letters (e.g., 'A', 'AL') into array indexes, allowing for easier configuration of which CSV columns to extract.
- **Data Normalization**: Focuses heavily on cleaning and normalizing the varied data formats found in PayPal exports (dates, times, and amounts with potential currency formatting issues).

## Key Functions & Algorithms
- `registerPaypalDataFromCSVData(csvData: string, userId: number)`:
    - **Extraction**: Uses `columnIndexes` to pull only the necessary fields from the parsed CSV.
    - **Date/Time Recomposition**: Manually reformats PayPal's date and time strings to ensure they are correctly interpreted by `dayjs`.
    - **Amount Cleaning**: A specialized algorithm to handle complex number formatting (e.g., removing thousands separators, handling quotes, and converting comma decimals).
    - **Categorization**: Performs keyword matching against transaction descriptions (compiled from PayPal's Item Name, Subject, Note, and Type fields).
- `getColumnIndex(columnName: string)`: A custom algorithm to convert Excel column letters to 0-based indexes.

## Interactions
- **excelModule**: For initial raw CSV to JavaScript array parsing.
- **Database (Prisma)**: To retrieve payment methods and category keywords.
- **BaseTransactions**: For standardized creation of transaction records.
- **dayjs**: For reliable date and time manipulation.

## Important Notes/Gotchas
- **CSV Version Compatibility**: Relies on the presence of 41 columns in the source CSV and specific data at the mapped indexes.
- **Amount Formatting**: The amount cleaning logic `replace('.', '').replace('&comma;', '.')` suggests it is tailored for specific regional PayPal formats where `.` is a thousands separator and `&comma;` or `,` is the decimal separator.
- **Transaction Types**: Specifically checks for the string 'Cargo' to determine if a transaction is a 'debit'.
- **Description Composition**: Generates a long description string by concatenating multiple PayPal fields, which increases the likelihood of a keyword match for categorization.
