# AGENTS.md - Database & Prisma

This document provides specific instructions for database work using Prisma in `finance-bot/prisma/`.

## Schema Overview

The database uses Prisma ORM with MySQL. Key models include:

- **User** - Multi-tenant root (every entity links to User via `userId`)
- **Transaction** - Financial transactions
- **Category** - Transaction categories
- **PaymentMethod** - Payment methods
- **Keyword** - Category keywords for auto-categorization
- **DailyExchangeRate** - VES to USD exchange rates
- **TaskQueue** - Async task processing

---

## Security Requirements

### Multi-Tenant Isolation (CRITICAL)

Every query MUST filter by `userId`. This is the FOUNDATIONAL security rule.

```typescript
// ✅ CORRECT: Always filter by userId
const transactions = await prisma.transaction.findMany({
  where: { userId: req.user.id }
});

// ❌ WRONG: Missing userId filter - exposes all users' data!
const transactions = await prisma.transaction.findMany();
```

### Query Patterns

```typescript
// Always use these patterns for multi-tenant safety:

// Find unique - must include userId
await prisma.category.findFirst({
  where: { 
    id: categoryId,
    userId: userId  // REQUIRED
  }
});

// Update - must include userId in where clause
await prisma.transaction.update({
  where: { 
    id: transactionId,
    userId: userId  // REQUIRED
  },
  data: { ... }
});

// Delete - must include userId
await prisma.transaction.delete({
  where: { 
    id: transactionId,
    userId: userId  // REQUIRED
  }
});

// Create - userId is required in data
await prisma.transaction.create({
  data: {
    userId: userId,  // REQUIRED
    amount: 100,
    // ...
  }
});
```

### Relationship Safety

```typescript
// When creating related entities, always connect to the authenticated user:

// ✅ CORRECT
await prisma.transaction.create({
  data: {
    user: { connect: { id: userId } },
    category: { connect: { id: categoryId } },  // Must verify ownership!
    // ...
  }
});

// ❌ WRONG - Could link to another user's category
await prisma.transaction.create({
  data: {
    category: { connect: { id: categoryId } },  // No ownership check!
    // ...
  }
});

// ✅ CORRECT - Verify category belongs to user first
const category = await prisma.category.findFirst({
  where: { id: categoryId, userId }
});
if (!category) {
  throw new AppError('Category not found', 404);
}
await prisma.transaction.create({
  data: {
    category: { connect: { id: categoryId } },
    // ...
  }
});
```

---

## Prisma Migration Best Practices

### Creating Migrations

```bash
# Development migration (can be reset)
npx prisma migrate dev --name migration_name

# Production migration (cannot be reset)
npx prisma migrate deploy --name migration_name
```

### Migration Naming
- Use descriptive names: `add_reviewed_to_transaction`
- Include table name: `add_category_user_unique`
- Keep migrations small and focused

### Before Running Migrations
1. Review the migration SQL
2. Test in development first
3. Backup production database
4. Plan rollback strategy

### After Migration
1. Run `npx prisma generate` to update client
2. Verify application works
3. Check for any breaking changes

---

## Query Optimization

### Avoiding N+1 Queries

```typescript
// ❌ WRONG - N+1 query
const users = await prisma.user.findMany();
for (const user of users) {
  const categories = await prisma.category.findMany({
    where: { userId: user.id }
  });
}

// ✅ CORRECT - Use include/select
const users = await prisma.user.findMany({
  include: {
    categories: true
  }
});
```

### Selecting Only Required Fields

```typescript
// ✅ Better performance
const transactions = await prisma.transaction.findMany({
  select: {
    id: true,
    amount: true,
    date: true,
    description: true
  }
});
```

### Using Indexes

The schema already includes indexes. When adding new fields that are queried frequently:

```prisma
model Transaction {
  // ... fields
  date DateTime
  
  @@index([date])
}
```

---

## Transactions

Use Prisma transactions for multi-table operations:

```typescript
// Simple transaction
await prisma.$transaction(async (tx) => {
  await tx.transaction.create({ data: transactionData });
  await tx.category.update({ where: { id }, data: { ... } });
});

// Interactive transaction (for long operations)
const result = await prisma.$transaction(async (tx) => {
  const count = await tx.transaction.count({ where: { userId } });
  
  if (count >= MAX_TRANSACTIONS) {
    throw new AppError('Limit reached', 400);
  }
  
  return tx.transaction.create({ data });
});
```

---

## Decimal Handling

The schema uses `Decimal` for monetary values:

```typescript
import { Decimal } from '@prisma/client/runtime/library';

// When working with decimals
const amount = new Decimal('100.50');

// Comparing decimals
if (transaction.amount?.greaterThan(decimalZero)) {
  // ...
}

// Converting for display
const displayAmount = transaction.amount?.toNumber();
```

---

## Schema Changes

### Adding a New Model

```prisma
model NewModel {
  id        Int      @id @default(autoincrement())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    Int
  name      String   @db.VarChar(100)
  createdAt DateTime @default(now())

  @@unique([name, userId])  // Always include userId in unique constraint
}
```

### Modifying Existing Model

```prisma
model Transaction {
  // Adding new optional field
  reviewedAt DateTime?
  
  // Modifying field
  description String? @db.VarChar(500)  // Increased from 255
}
```

### Migration Process

1. Modify `schema.prisma`
2. Run `npx prisma migrate dev --name descriptive_name`
3. Review generated SQL
4. Test in development
5. Deploy with backup plan

---

## Seeding

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create demo user
  const user = await prisma.user.create({
    data: {
      firebaseId: 'demo-firebase-id',
      email: 'demo@example.com',
    }
  });

  // Create categories for demo user
  await prisma.category.createMany({
    data: [
      { userId: user.id, name: 'Food' },
      { userId: user.id, name: 'Transport' },
    ]
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run seed with: `npx prisma db seed`

---

## Prisma Client Usage

### Importing

```typescript
// Use the singleton from database module
import { PrismaModule } from '../modules/database/database.module';

// Or create your own instance (not recommended - use module)
import { PrismaClient } from '@prisma/client';
```

### Type Safety

```typescript
// Full type inference
const transaction = await prisma.transaction.findFirst({
  where: { userId }
});

// TypeScript knows transaction type
transaction.amount; // Decimal | null
transaction.description; // string | null
```

---

## Common Patterns

### Pagination

```typescript
const page = 1;
const pageSize = 20;

const transactions = await prisma.transaction.findMany({
  where: { userId },
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { date: 'desc' }
});
```

### Bulk Operations

```typescript
// Create many
await prisma.category.createMany({
  data: [
    { userId, name: 'Food' },
    { userId, name: 'Transport' },
  ],
  skipDuplicates: true
});

// Update many
await prisma.transaction.updateMany({
  where: { 
    userId,
    date: { lt: cutoffDate }
  },
  data: { reviewed: true }
});
```

### Upsert

```typescript
await prisma.category.upsert({
  where: {
    name_userId: {  // Must match @@unique
      name: 'Food',
      userId
    }
  },
  update: { description: 'Updated' },
  create: { name: 'Food', userId }
});
```

---

## Validation

Always validate schema changes:

```bash
npx prisma validate
npx prisma format
```

---

## File Locations

| Purpose | Path |
|---------|------|
| Schema | `prisma/schema.prisma` |
| Migrations | `prisma/migrations/` |
| Seed | `prisma/seed.ts` |
| Factories | `prisma/factories/` |
| Generated client | `node_modules/.prisma/client` |

---

## Testing with Prisma

### Mocking

```typescript
import { mockDeep } from 'jest-mock-extended';

const mockPrisma = mockDeep<PrismaClient>();
mockPrisma.transaction.findMany.mockResolvedValue([]);
```

### Test Database

Use separate test database or use `mock-fs` for file-based testing.

---

## Backup & Recovery

### Backup
```bash
# MySQL dump
mysqldump -u user -p database_name > backup.sql
```

### Recovery
```bash
mysql -u user -p database_name < backup.sql
```

---

## Performance Monitoring

Monitor slow queries:
- Enable MySQL slow query log
- Use Prisma query logging in development
- Check for missing indexes
- Analyze EXPLAIN plans for complex queries
