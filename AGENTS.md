# AGENTS.md - Backend Development

This document provides specific instructions for backend development in the `zentra-api/` (formerly `finance-bot/`) directory.

## Architecture Overview

### Stack
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (strict mode)
- **Database**: MySQL with Prisma ORM
- **Caching**: Redis
- **Auth**: Firebase Admin SDK
- **Logging**: Winston

### Module Structure
Each feature lives in `modules/` as a self-contained module with `.module.ts` naming:
```
modules/
├── base-transactions/
├── commands/
├── crons/
├── database/
├── excel/
├── gmail/
├── image-2-text/
├── mercantil-panama/
├── notifications/
├── paypal/
├── reports/
├── scraper-api-pydolar/
└── telegram/
```

---

## Security Requirements

### Authentication & Authorization
- ALL protected routes MUST use `requireAuth` middleware (see `src/lib/auth.middleware.ts`)
- Role-based access control via `requireRole(roles[])` middleware
- Verify Firebase tokens on every authenticated request
- Never trust client-supplied user IDs - use `req.user.id` from authenticated session

### Input Validation (MANDATORY)
```typescript
// DO: Validate all inputs
const amount = Number(req.body.amount);
if (isNaN(amount) || amount <= 0) {
  throw new AppError('Invalid amount', 400);
}

// DON'T: Trust raw input
const transaction = await prisma.transaction.create({
  data: req.body  // NEVER do this
});
```

### SQL Injection Prevention
- Prisma ORM uses parameterized queries automatically
- NEVER use raw SQL with string interpolation
- If raw SQL is required, use parameterized queries:
  ```typescript
  await prisma.$queryRaw`SELECT * FROM Transaction WHERE userId = ${userId}`;
  ```

### Sensitive Data
- NEVER log: tokens, passwords, credit card numbers, API keys
- Use environment variables for all secrets (see `.env.example`)
- Sanitize error messages before sending to client
- Never expose stack traces in production

### File Upload Security
- Validate file types before processing
- Limit file sizes (max 10MB for images)
- Never store uploaded files with user-supplied names
- Scan uploads for malicious content

### Rate Limiting
- Implement rate limiting on public endpoints
- Use Redis for distributed rate limiting in production

---

## Code Patterns

### Module Pattern
```typescript
// modules/example/example.module.ts
class ExampleModule {
  private _db: PrismaClient;
  
  constructor() {
    this._db = PrismaModule;
  }

  async doSomething(userId: number, data: InputType): Promise<OutputType> {
    // Always filter by userId for multi-tenant isolation
    const result = await this._db.entity.findFirst({
      where: { userId }
    });
    
    if (!result) {
      throw new AppError('Not found', 404);
    }
    
    return result;
  }
}

export const Example = new ExampleModule();
```

### Express Route Pattern
```typescript
// routes/example.ts
import { Router } from 'express';
import { requireAuth } from '../src/lib/auth.middleware';
import { Example } from '../modules/example/example.module';

const router = Router();

router.post('/example', requireAuth, async (req, res, next) => {
  try {
    const result = await Example.doSomething(req.user.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
```

### Error Handling
```typescript
// Always use AppError for operational errors
import { AppError } from '../src/lib/appError';

throw new AppError('Meaningful error message', 400);

// For unexpected errors, let them propagate to Express error handler
// but ensure they don't leak sensitive information
```

### Redis Caching Pattern
```typescript
import { redisClient } from '../src/lib/redis';

const cacheKey = `entity:${userId}:${identifier}`;
const cached = await redisClient.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const result = await databaseCall();
await redisClient.set(cacheKey, JSON.stringify(result), 3600); // 1 hour TTL

return result;
```

---

## Prisma Best Practices

### Multi-Tenant Queries (CRITICAL)
```typescript
// ALWAYS include userId filter
const transactions = await prisma.transaction.findMany({
  where: { userId: req.user.id }  // REQUIRED
});

// DON'T do this
const transactions = await prisma.transaction.findMany(); // DANGEROUS
```

### Avoiding N+1 Queries
```typescript
// DO: Use include/select for related data
const userWithCategories = await prisma.user.findUnique({
  where: { id: userId },
  include: { categories: true }
});

// DON'T: Fetch related data in loops
for (const userId of userIds) {
  const categories = await prisma.category.findMany({ where: { userId } });
}
```

### Transactions
```typescript
// Use transactions for multi-table operations
await prisma.$transaction(async (tx) => {
  await tx.transaction.create({ data: transactionData });
  await tx.category.update({ where: { id }, data: { ... } });
});
```

### Schema Changes
1. Create migration: `npx prisma migrate dev --name migration_name`
2. Test migration locally first
3. Never modify migration files after they're applied to production
4. Use `npx prisma validate` before committing

---

## Cron Jobs

### Safety Requirements
- ALL cron jobs must be idempotent (can run multiple times safely)
- Use database locks or Redis to prevent duplicate execution
- Implement proper error handling and logging
- Set appropriate timeouts

### Example Pattern
```typescript
import cron from 'node-cron';

cron.schedule('0 9 * * *', async () => {
  const lockKey = 'cron:daily-task';
  
  // Acquire lock
  const locked = await redisClient.set(lockKey, '1', 'NX', 'EX', 3600);
  if (!locked) {
    logger.info('Daily task already running, skipping');
    return;
  }

  try {
    await doDailyTask();
  } finally {
    await redisClient.del(lockKey);
  }
});
```

---

## Gmail Integration Security

### Credentials
- Store credentials in environment variables, never in code
- Use OAuth2, never store passwords
- Credentials path: `src/config.ts` - `GMAIL_CREDENTIALS_PATH`
- Token path: `src/config.ts` - `GMAIL_TOKEN_PATH`

### Email Processing
- Validate sender addresses
- Sanitize email content before storing
- Don't store full email content unless necessary
- Implement rate limiting on email polling

---

## Telegram Bot Security

### Webhook Verification
- Verify webhook tokens from Telegram
- Don't trust anonymous updates
- Validate all callback data

### Rate Limits
- Implement message rate limiting per user
- Use queue system for bulk operations

---

## Testing Requirements

### Coverage
- **Minimum 85% code coverage** required
- Run: `npm test`
- All new features MUST have tests

### Test Patterns
```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('ModuleName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should do something', async () => {
    // Arrange
    const mockData = { ... };
    
    // Act
    const result = await module.method(mockData);
    
    // Assert
    expect(result).toEqual(expected);
  });
});
```

### Mocking
- Mock external dependencies: Firebase, Redis, Prisma
- Use `jest-mock-extended` for type-safe mocks

---

## Linting & Code Style

### Prettier Configuration
```json
{
  "tabWidth": 2,
  "useTabs": true,
  "printWidth": 120,
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true
}
```

### ESLint Rules
- Extends: `standard`, `prettier`, `plugin:@typescript-eslint/recommended`
- Jest plugin enabled for test files

### Pre-commit Hook
- Husky runs `lint-staged` on staged files
- Linting includes Prettier + ESLint

### Running Checks
```bash
npm run lint    # Run linter
npm test       # Run tests with coverage
npm run build  # Compile TypeScript
```

---

## Logging

### Winston Logger
- Use `src/lib/logger.ts` for all logging
- Set LOG_LEVEL in environment
- Production: JSON format
- Development: Colorized human-readable format

### What to Log
- Request/response lifecycle (without sensitive data)
- Business logic milestones
- Errors with context (not stack traces to clients)

### What NOT to Log
- Passwords, tokens, API keys
- Full request bodies containing sensitive data
- Stack traces (handle via error tracking service)

---

## Environment Variables

All required variables documented in `.env.example`:
- `DATABASE_URL` - MySQL connection
- `REDIS_URL` - Redis connection
- `FIREBASE_PROJECT_ID` - Firebase project
- `TEST_CHAT_ID` - Telegram test chat

---

## File Organization

| Purpose | Path |
|---------|------|
| Entry point | `bin/www.ts` |
| Routes | `routes/` |
| Modules | `modules/` |
| Libraries | `src/lib/` |
| Helpers | `src/helpers/` |
| Services | `src/services/` |
| Config | `src/config.ts` |
| Enums | `src/enums/` |
| Database module | `modules/database/` |
| Prisma schema | `prisma/schema.prisma` |
| Migrations | `prisma/migrations/` |
| Tests | `**/*.test.ts` |
