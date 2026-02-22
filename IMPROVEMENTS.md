# Finance Bot — Possible Improvements

A comprehensive review of the codebase covering architecture, code quality, security, performance, testing, and DevOps.

---

## Table of Contents

- [Critical](#critical)
- [Security](#security)
- [Type Safety](#type-safety)
- [Error Handling](#error-handling)
- [Performance](#performance)
- [Code Quality](#code-quality)
- [Testing](#testing)
- [Architecture](#architecture)
- [Database](#database)
- [DevOps & CI/CD](#devops--cicd)
- [Logging & Observability](#logging--observability)
- [Documentation](#documentation)
- [Miscellaneous](#miscellaneous)

---

## Critical

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | Wrong Prisma import path `.prisma/client` instead of `@prisma/client` | `modules/mercantil-panama/mercantil-panama.module.ts`, `modules/crons/exchange-currency/exchange-currency.service.ts` | Change to `import { ... } from '@prisma/client'` |
| 2 | `async` callbacks inside `forEach` — updates run concurrently with no error aggregation and no backpressure | `modules/crons/exchange-currency/exchange-currency.service.ts` (`getAmountResult`) | Replace `forEach(async ...)` with `for...of` + `await`, or use `Promise.all` with concurrency control |
| 3 | Fallback `paymentMethod?.id ?? 0` can write FK value `0` to the database | `modules/paypal/paypal.module.ts:124`, `modules/mercantil-panama/mercantil-panama.module.ts:72`, `prisma/seed.ts:60` | Throw an error or skip the record when the payment method/keyword is not found |
| 4 | Express error handler has only 3 parameters — Express requires 4 (`err, req, res, next`) to recognize it as an error handler | `app.ts:33-43` | Add the `next` parameter: `(err, req, res, next)` |
| 5 | Duplicate / unreachable 404 handlers | `app.ts:22-29` | Keep a single 404 handler; remove the duplicate |
| 6 | `telegramBot.sendMessage` not awaited in webhook — response sent before message delivery is confirmed | `controllers/telegram/telegram.controller.ts:38,73` | `await` the call or handle the promise |

---

## Security

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | No Telegram webhook secret verification | `controllers/telegram/telegram.controller.ts` | Use Telegram's `secret_token` header to verify webhook authenticity |
| 2 | No input validation on any endpoint (`url`, `chatId`, `message`, webhook body) | `controllers/telegram/telegram.controller.ts:13-76` | Add a validation library (Zod or Joi) and validate all incoming request bodies |
| 3 | No authentication or rate limiting on API routes | `routes/` | Add rate-limiting middleware (e.g. `express-rate-limit`) and auth where appropriate |
| 4 | Production Dockerfile copies `.env` into the image | `docker/production/Dockerfile:25` | Remove the COPY; pass env vars at runtime via `env_file` or orchestration secrets |
| 5 | `TELEGRAM_BOT_URL` / `TELEGRAM_FILE_URL` silently contain `"undefined"` when env var is missing | `src/telegram/variables.ts:5-6` | Fail fast at startup if `TELEGRAM_BOT_TOKEN` is missing |
| 6 | User-controlled `caption` used as `filename` in FormData | `modules/telegram/telegram.module.ts:48` | Sanitize the caption before using it as a filename |
| 7 | No CSV size limit — a very large upload could exhaust memory | `modules/excel/excel.module.ts` | Add a file size / row count limit |

---

## Type Safety

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | Heavy use of `any` across the codebase (often with `eslint-disable`) | `modules/telegram/telegram.module.ts`, `modules/commands/commands.module.ts`, `modules/reports/reports.module.ts`, `modules/paypal/paypal.module.ts`, `modules/mercantil-panama/mercantil-panama.module.ts`, `prisma/seed.ts`, `prisma/factories/index.ts`, `app.ts` | Define proper interfaces and types; replace `any` with Prisma-generated types or custom DTOs |
| 2 | Factory functions accept `data: any` | `prisma/factories/index.ts` | Type factory params with `Partial<Prisma.XCreateInput>` |
| 3 | `bin/www.ts` error handler types `error` as `{ syscall: string; code: string }` — incomplete | `bin/www.ts:56` | Use `NodeJS.ErrnoException` |
| 4 | Route handler uses untyped `function (req, res)` | `routes/router.ts:7-9` | Add `Request` and `Response` types from Express |

---

## Error Handling

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | Errors swallowed in multiple modules — caught, logged, but not rethrown or returned as structured failures | `modules/telegram/telegram.module.ts`, `modules/scraper-api-pydolar`, `modules/image-2-text`, `modules/crons/exchange-currency/exchange-currency.service.ts` | Define a custom `AppError` class; rethrow or return structured results so callers can handle failures |
| 2 | Webhook error handler responds with HTTP 200 and forwards a truncated error message to the user | `controllers/telegram/telegram.controller.ts:79-86` | Log the full error server-side; send a generic "something went wrong" message to the user; keep 200 for Telegram but improve internal handling |
| 3 | `req.body.message.chat.id` accessed in the catch block without null checks | `controllers/telegram/telegram.controller.ts:83` | Use optional chaining or a fallback chat ID |
| 4 | Cron errors only logged — no retry or dead-letter strategy | `modules/crons/task-queue.cron.ts:71-73,156-158` | Mark failed tasks with an error status and implement a retry policy |
| 5 | `scraper-api-pydolar` throws a generic string, losing the original error | `modules/scraper-api-pydolar/scraper-api-pydolar.module.ts:15-16` | Wrap with `new Error(message, { cause: originalError })` |
| 6 | No global unhandled rejection / uncaught exception handlers | `bin/www.ts` / `app.ts` | Add `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)` for graceful shutdown |

---

## Performance

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | N+1 queries: one `category.findFirst` per word in the description | `modules/base-transactions/base-transactions.module.ts:161-179` | Fetch all keywords in one query, then match in memory |
| 2 | N+1 updates: `forEach(async ...)` updates each transaction individually | `modules/crons/exchange-currency/exchange-currency.service.ts:38-47` | Use `prisma.$transaction` with batch updates or `updateMany` where possible |
| 3 | Missing database index on `DailyExchangeRate.date` | `prisma/schema.prisma` | Add `@@index([date])` |
| 4 | Missing composite index on `TaskQueue(type, status)` | `prisma/schema.prisma` | Add `@@index([type, status])` |
| 5 | `DailyExchangeRate` has no unique constraint on `date` — `findFirst` can return non-deterministic results | `prisma/schema.prisma` | Add `@@unique([date])` or `@@unique([date, currency])` |
| 6 | Large PayPal CSV creates many individual `prisma.transaction.create` inside `$transaction` | `modules/paypal/paypal.module.ts:74-146` | Use `createMany` for bulk inserts |
| 7 | Seed performs one `findUnique` + `upsert` per keyword | `prisma/seed.ts:50-77` | Use `createMany` with `skipDuplicates` |

---

## Code Quality

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | `webhookHandler` is ~57 lines mixing routing, parsing, file handling, and command execution | `controllers/telegram/telegram.controller.ts:30-86` | Extract into a service layer; separate message type handling into individual handlers |
| 2 | Long functions with mixed concerns | `modules/base-transactions/base-transactions.module.ts` (`registerManualTransactions`, `registerTransactionFromImages`), `modules/paypal/paypal.module.ts` (`registerPaypalDataFromCSVData`), `prisma/seed.ts` (`main`) | Break into smaller, single-responsibility functions |
| 3 | Repeated column iteration in report markdown building | `modules/reports/reports.module.ts:66-89` | Extract a generic markdown table helper |
| 4 | Duplicated CSV fixtures across test files | `modules/paypal/paypal.module.test.ts`, `modules/commands/commands.module.test.ts`, `modules/mercantil-panama/mercantil-panama.module.test.ts` | Create shared test fixtures in a `test/fixtures/` directory |
| 5 | Duplicate `describe` blocks with overlapping test cases | `modules/base-transactions/base-transactions.module.test.ts` | Consolidate into a single `describe` |
| 6 | Hardcoded year `'2023'` in monthly report query | `modules/reports/reports.module.ts:15` | Use `dayjs().year()` or accept the year as a parameter |
| 7 | Magic numbers throughout the codebase (hours 9/11, description length 100, message truncation 250, column count 41, cron expressions, timezone) | Multiple files | Extract to named constants or configuration |
| 8 | `morgan` called twice (`'dev'` and `'combined'`) — second overwrites first | `app.ts:19,14` | Use a single logger format, or conditionally choose based on `NODE_ENV` |

---

## Testing

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | No integration / API tests — `supertest` is installed but unused | — | Add route-level tests using `supertest` for all Telegram endpoints |
| 2 | No tests for controllers, routes, `app.ts`, `bin/www.ts`, or `prisma/seed.ts` | `controllers/`, `routes/`, `app.ts`, `bin/www.ts`, `prisma/seed.ts` | Add unit and integration tests for the HTTP layer |
| 3 | No tests for the cron task queue entry point | `modules/crons/task-queue.cron.ts` | Add tests with mocked timers and DB |
| 4 | Cron test expression (`'0 */10 * * * *'` — every 10 min) appears to be active | `modules/crons/task-queue.cron.ts:14-15` | Ensure dev/test cron expressions are not shipped to production; use env-based config |
| 5 | Factory functions have fields that don't match current Prisma schema | `prisma/factories/index.ts` | Align factories with current schema types |
| 6 | Test file name has a typo: `scaper-api-pydolar.module.test.ts` | `modules/scraper-api-pydolar/` | Rename to `scraper-api-pydolar.module.test.ts` |

---

## Architecture

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | No dependency injection — modules import singletons directly | All modules | Consider a lightweight DI approach (constructor injection) to improve testability and decoupling |
| 2 | Thick controller — webhook handler contains business logic | `controllers/telegram/telegram.controller.ts` | Move orchestration logic to a service layer; controller should only parse input and return responses |
| 3 | Cron jobs started as a side effect of importing `app.ts` | `app.ts` | Make cron startup explicit and conditional (e.g. skip during tests) |
| 4 | No path aliases for imports — deeply nested relative paths (`../../database/database.module`) | `tsconfig.json`, multiple files | Add path aliases like `@modules/`, `@src/`, `@prisma/` in `tsconfig.json` |
| 5 | No route versioning (`/api/v1/...`) | `routes/` | Add API versioning if the bot will expose more endpoints in the future |
| 6 | No graceful shutdown handling | `bin/www.ts` | Handle `SIGTERM` / `SIGINT` to close DB connections and drain requests |

---

## Database

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | `DailyExchangeRate` allows duplicate rows for the same date | `prisma/schema.prisma` | Add `@@unique([date])` or `@@unique([date, currency])` |
| 2 | Missing indexes on frequently queried columns | `prisma/schema.prisma` | Add `@@index([date])` on `DailyExchangeRate`, `@@index([type, status])` on `TaskQueue`, consider index on `Transaction(amount)` for "IS NULL" queries |
| 3 | `deploy.sh` runs both `migrate deploy` and `migrate dev` | `deploy.sh` | Remove `migrate dev` from production deploy; it's interactive and can reset data |
| 4 | Typo: model `Suscription` should be `Subscription` | `prisma/schema.prisma` | Rename with a migration (also update all references in code) |

---

## DevOps & CI/CD

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | CI only runs `npm install` and `npm test` — no build, no lint, no type-check | `.github/workflows/ci-cd.yml` | Add `npm run build` and `npm run lint` steps |
| 2 | No `.nvmrc` or `.node-version` file — Node 18 used in Docker but not pinned locally | Root | Add `.nvmrc` with `18` (or upgrade to 20 LTS) |
| 3 | Typo in image-service Dockerfiles: `PYHTONUNBUFFERED` | `docker/production/image-service/Dockerfile`, `docker/local/image-service/Dockerfile` | Fix to `PYTHONUNBUFFERED` |
| 4 | No health check endpoint | `routes/` | Add a `/health` route that checks DB connectivity |
| 5 | Production Dockerfile copies `.env` into the image | `docker/production/Dockerfile` | Remove; inject env at runtime |
| 6 | Port mismatch: `.env.example` says 5000, local Docker maps 4001 | `docker/local/docker-compose.yml`, `.env.example` | Align port configuration |
| 7 | No Docker layer caching strategy in CI | `.github/workflows/ci-cd.yml` | Add Docker build caching if CI builds images in the future |
| 8 | No `.prettierignore` | Root | Add to avoid formatting generated files (e.g. `prisma/migrations/`, `dist/`) |

---

## Logging & Observability

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | Winston is a dependency but never used — all logging is `console.log` / `console.error` | Multiple modules | Replace `console.*` with Winston; use structured JSON logging with levels (info, warn, error) |
| 2 | No request ID or correlation ID for tracing requests | `app.ts` | Add a middleware that attaches a UUID to each request for log correlation |
| 3 | No error monitoring integration (e.g. Sentry) | — | Consider adding Sentry or a similar service for production error tracking |
| 4 | `morgan` configured with both `'dev'` and `'combined'` | `app.ts` | Use `'dev'` for development and `'combined'` (or JSON) for production, based on `NODE_ENV` |

---

## Documentation

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | No API documentation (OpenAPI / Swagger) | — | Add `swagger-jsdoc` + `swagger-ui-express` or export an OpenAPI spec |
| 2 | README lacks architecture overview and module descriptions | `README.md` | Add a high-level architecture diagram and module responsibility summary |
| 3 | No `CONTRIBUTING.md` or development setup guide | — | Document local dev setup, testing, and code conventions |
| 4 | No changelog | — | Consider a `CHANGELOG.md` or use conventional commits + auto-generation |

---

## Miscellaneous

| # | Issue | Recommendation |
|---|-------|----------------|
| 1 | Typo: `"Entertaiment"` in payment methods enum | `src/enums/paymentMethods.ts:54` — fix to `"Entertainment"` |
| 2 | Typo: `"SUSCRIPTION"` / `"Suscription"` used throughout instead of `"SUBSCRIPTION"` | `src/enums/paymentMethods.ts`, `prisma/schema.prisma` — rename consistently |
| 3 | Typo in `.eslintignore`: `image-reconigtion-service` | `.eslintignore` — fix to `image-recognition-service` |
| 4 | Stray backtick line at end of `.eslintignore` | `.eslintignore` — remove |
| 5 | `eslintrc` browser env enabled for a Node.js app | `.eslintrc.json` — remove `browser: true` |
| 6 | Leading underscore naming for private methods is inconsistent with the rest of the codebase | `modules/base-transactions/base-transactions.module.ts`, `modules/crons/task-queue.cron.ts` — pick one convention and apply consistently |
| 7 | `calculateUSDAmountByRate` does not guard against zero or negative `bcvPrice` | `src/helpers/rate.helper.ts:33-36` — add a check to prevent `Infinity` or negative amounts |
| 8 | `src/config.ts` defaults `TEST_CHAT_ID` to `0`, which is invalid for Telegram | `src/config.ts:2` — fail fast or use a clearly invalid sentinel |
