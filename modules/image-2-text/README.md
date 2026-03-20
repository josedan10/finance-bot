# Image-to-Text Module (OCR)

## Purpose
Extracts raw text from transaction screenshots or physical receipts to facilitate automated entry.

## Architecture & Design Decisions
This module acts as a **thin client wrapper**. It does not perform the heavy Optical Character Recognition (OCR) locally in Node.js.
- **Why?** Node.js is not ideal for heavy, CPU-bound image processing. Instead, it delegates this task to a dedicated Python microservice (FastAPI + Tesseract) running in a separate Docker container. This keeps the main Node.js event loop unblocked.

## Key Functions
- `extractTextFromImages`: Accepts either an array of Image URLs or direct Base64 encoded strings. It constructs a payload, sends it to the Python OCR service, and returns the extracted text array.

## Interactions
- **External Microservice**: Communicates with the Python OCR service defined by the `IMAGE_2_TEXT_SERVICE_URL` environment variable.
- **Internal**: Used by `base-transactions` (for frontend uploads) and `telegram` (for images sent via chat).

## Important Notes/Gotchas
- **Payload Size**: When sending Base64 strings, payloads can get very large. Ensure the Python service is configured to accept large request bodies.
- **Accuracy**: The returned text is often messy or unstructured. It requires downstream parsing (handled by `base-transactions`) to make sense of the data.
