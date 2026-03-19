# Scraper API PyDolar Module

## Purpose
The `ScraperPydolarModule` is a lightweight service dedicated to fetching current exchange rates (specifically for USD to Venezuelan Bolivares) from an external API (PyDolar). This information is crucial for systems dealing with multi-currency transactions in the Venezuelan market.

## Architecture & Design Decisions
- **Singleton Pattern**: Exported as a singleton instance called `ScraperPydolarModule`.
- **Minimalist Client**: A thin wrapper around `axios`, focused only on fetching the required exchange rate data.
- **Config-Driven**: The target API URL is managed through the system's global `config`, allowing for easy environment-based updates.

## Key Functions & Algorithms
- `getPricesData()`: 
    - Executes an asynchronous GET request to the PyDolar API.
    - Extracts two specific rates:
        - **BCV**: The official exchange rate provided by the Central Bank of Venezuela.
        - **Monitor**: The popular "parallel" or market-driven exchange rate (EnParaleloVzla).
    - Returns a simple object containing these two numeric values.

## Interactions
- **External API (PyDolar)**: This module depends entirely on the availability and structure of the external PyDolar API.
- **axios**: For HTTP communication.
- **config**: To retrieve `PYDOLAR_API_URL`.

## Important Notes/Gotchas
- **API Sensitivity**: If the PyDolar API changes its response structure (`monitors.bcv.price` or `monitors.enparalelovzla.price`), this module will fail.
- **Error Handling**: Throws a generic error "Error getting daily exchange rate task" if the request fails, which should be caught by the caller (likely a background cron job).
- **Currency Context**: This module is specifically tailored for the Venezuelan exchange market.
