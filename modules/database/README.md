# Database Module

## Name & Purpose
**Name:** PrismaModule
**Purpose:** Provides a centralized Prisma Client instance to the entire application for database interactions.

## Architecture & Design Decisions
- **ORM Choice:** Uses **Prisma**, which provides a type-safe database client and simplifies schema management and migrations.
- **Single Instance:** Exports a single, shared `PrismaClient` instance to avoid multiple connection pools and manage resources efficiently.
- **Decoupled Configuration:** The database schema is defined in `prisma/schema.prisma`, and connectivity is handled via environment variables (e.g., `DATABASE_URL`).

## Key Functions/Logic
- `PrismaModule`: The exported constant `prisma` is the initialized `PrismaClient`. It provides access to all model-level methods (e.g., `prisma.user.findMany`, `prisma.transaction.create`).
- **Transaction Support:** Supports atomic operations using `prisma.$transaction`.

## Interactions
- **Controllers & Modules:** Almost every part of the backend imports `PrismaModule` to perform CRUD operations on users, transactions, categories, payment methods, and more.
- **Middleware:** The `auth.middleware.ts` uses it to verify user presence in the database.

## Important Notes/Gotchas
- **Lifecycle:** The client should ideally be disconnected gracefully during application shutdown, though in a server environment like Express, it usually persists with the process.
- **Connection Limits:** Be mindful of the maximum number of connections allowed by the database provider, especially when scaling horizontal instances.
- **Mocking:** For testing, `database.module.mock.ts` and `redis.module.mock.ts` are available to simulate database behavior without actual DB connections.
