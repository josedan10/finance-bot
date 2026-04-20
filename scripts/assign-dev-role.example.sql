-- Example: promote selected internal users to role `dev` in MySQL.
-- Replace placeholders, run the SELECT first, then use a transaction and COMMIT only when counts match.
--
-- Never paste untrusted input into SQL; use bound parameters in your client when possible.

-- 1) Inspect current rows
SELECT id, email, firebaseId, role, createdAt
FROM User
WHERE LOWER(email) IN ('internal.one@example.com', 'internal.two@example.com')
   OR firebaseId IN ('firebase-uid-one', 'firebase-uid-two');

-- 2) Optional: restrict to standard accounts only
SELECT id, email, role
FROM User
WHERE (LOWER(email) IN ('internal.one@example.com') OR firebaseId IN ('firebase-uid-one'))
  AND role = 'user';

-- 3) Apply inside a transaction; verify ROW_COUNT() before committing
START TRANSACTION;

UPDATE User
SET role = 'dev'
WHERE (LOWER(email) IN ('internal.one@example.com', 'internal.two@example.com')
	OR firebaseId IN ('firebase-uid-one', 'firebase-uid-two'))
  AND role = 'user';

-- In mysql client: SELECT ROW_COUNT();

-- 4) Re-verify
SELECT id, email, role FROM User WHERE LOWER(email) IN ('internal.one@example.com');

-- ROLLBACK;
-- COMMIT;
