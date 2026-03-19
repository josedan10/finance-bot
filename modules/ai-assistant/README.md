# AI Assistant Module

## Purpose
Provides AI-powered financial analysis, anomaly detection, and budget suggestions. It acts as the intelligent brain of the application, helping users understand their spending habits beyond basic charts.

## Architecture & Design Decisions
The module is designed using a **Factory Pattern** (`AIAssistantFactory`). 
- **Why?** To allow users (or the system) to seamlessly switch between different LLM providers (currently Google Gemini and OpenAI ChatGPT) based on preferences, API key availability, or cost considerations. It defines a common interface (`IAIAssistantService`) that all providers must implement.

## Key Functions & Algorithms
- `analyzeExpenses`: Takes an array of raw transactions and prompts the LLM to summarize them into high-level categories and identify spending trends.
- `detectAnomalies`: Analyzes historical spending to identify unusual patterns (e.g., a subscription that doubled in price, or a highly unusual spike in "Entertainment").
- `suggestBudget`: Proposes realistic budget limits for the upcoming month based on historical averages and recent trends.

## Interactions
- **Database (`PrismaModule`)**: Fetches user-specific `AISettings` to determine which provider to use.
- **External Services**: Communicates directly with OpenAI and Google Gemini APIs.

## Important Notes/Gotchas
- **Rate Limiting**: AI calls are relatively slow and expensive. The controller endpoints using this module should ideally be rate-limited or cached to prevent abuse.
- **Prompt Engineering**: The accuracy of the analysis relies heavily on the system prompts defined in the respective service files. If the transaction data structure changes, prompts must be updated.
