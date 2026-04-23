# Staging verification: security dashboard and `dev` role

Use this checklist against your real staging domain, Firebase project, and API base URL. Replace placeholders as you go.

## Prerequisites

- [ ] Staging API is deployed and healthy (`GET /health` or equivalent returns success).
- [ ] Staging UI is built with staging `NEXT_PUBLIC_*` variables (especially `NEXT_PUBLIC_API_URL` and Firebase keys for the **staging** Firebase project).
- [ ] Backend `.env` for staging includes valid `DATABASE_URL`, Firebase Admin credentials for the **same** staging Firebase project, and (if used) `SECURITY_DASHBOARD_ALLOWED_ROLES` aligned with the UI (`NEXT_PUBLIC_SECURITY_DASHBOARD_ALLOWED_ROLES`, default `dev`).
- [ ] Prisma migration that adds `User.role` has been applied on the staging database.

## 1) Assign `dev` to internal operators

Pick **one** approach.

### Option A — Prisma script (recommended)

From `finance-bot/` with `DATABASE_URL` pointing at **staging**:

1. Dry run (no writes):

   ```bash
   npx ts-node scripts/assign-dev-role.ts --emails YOUR_EMAIL@company.com
   ```

2. Confirm listed users match expectations, then apply:

   ```bash
   npx ts-node scripts/assign-dev-role.ts --emails YOUR_EMAIL@company.com --apply
   ```

3. If a user already has a non-`user` role and you still want `dev`, add `--allow-non-user` (review the script output carefully before `--apply`).

You can target Firebase UIDs instead of emails: `--firebaseIds UID1,UID2`.

### Option B — SQL in a MySQL client

Use `scripts/assign-dev-role.example.sql` as a template: run the `SELECT` steps, then a `START TRANSACTION` / `UPDATE` / verify / `COMMIT` only when row counts match.

## 2) Backend API checks (Bearer token)

Obtain a **staging** Firebase ID token for a user who should have `dev` in the database (same account you updated above). Common options: browser devtools on the staging app (network tab on an authenticated API call), or a short-lived test harness using the Firebase client SDK.

**Token hygiene (recommended):** Putting `export STAGING_ID_TOKEN="eyJ..."` on one line saves the bearer token to your shell history (`~/.zsh_history` / `~/.bash_history`) and can expose it in process listings. Prefer one of:

- Paste the token without echoing it:

  ```bash
  read -rs STAGING_ID_TOKEN && export STAGING_ID_TOKEN
  ```

  (`-s` hides input; press Enter after pasting.)

- Or prefix the line with a space **and** ensure `HISTCONTROL=ignorespace` (or `ignoreboth`) is set so that line is not saved to history—then:

  ```bash
  export STAGING_ID_TOKEN="eyJ..."
  ```

Only `API_BASE` needs to be a normal `export` if you like; it is not a secret like the ID token.

**Response files:** The `curl` examples below use `-o` to write **response bodies** only (JSON). They do **not** store the `Authorization` header. Do not add `-v` / `--trace-ascii` and redirect that output to a shared log, and do not `tee` a trace that includes request headers—those can leak the bearer token.

Set `API_BASE` (zsh/bash):

```bash
export API_BASE="https://your-staging-api.example.com"
```

Set `STAGING_ID_TOKEN` using `read -rs` (or the space-prefixed `export` pattern above), then continue.
- [ ] **Authorized dev** — expect `200` and JSON with `totals`:

  ```bash
  curl -sS -o /tmp/sec-summary.json -w "%{http_code}" \
    -H "Authorization: Bearer ${STAGING_ID_TOKEN}" \
    "${API_BASE}/api/security/summary"
  ```

  Inspect `/tmp/sec-summary.json` for `totals.events`, `totals.activeBlocks`, etc.

- [ ] **Events list** — expect `200`:

  ```bash
  curl -sS -o /tmp/sec-events.json -w "%{http_code}" \
    -H "Authorization: Bearer ${STAGING_ID_TOKEN}" \
    "${API_BASE}/api/security/events?page=1&pageSize=10"
  ```

- [ ] **Blocks list** — expect `200`:

  ```bash
  curl -sS -o /tmp/sec-blocks.json -w "%{http_code}" \
    -H "Authorization: Bearer ${STAGING_ID_TOKEN}" \
    "${API_BASE}/api/security/blocks?page=1&pageSize=10"
  ```

- [ ] **Non-privileged user** — sign in as a normal `user` account, repeat one of the calls above with that user’s token; expect **403** and a forbidden-style message (exact body may vary).

- [ ] **Unauthenticated** — omit `Authorization`; expect **401** on the same routes.

## 3) Auth profile reflects `role`

With the **dev** user’s token (same hygiene as above—do not log full `curl -v` output):

```bash
curl -sS -H "Authorization: Bearer ${STAGING_ID_TOKEN}" "${API_BASE}/api/auth/me"
```

- [ ] Response includes your user payload and `role` (or equivalent field your client uses) set to `dev`, so the UI can show the security dashboard.

## 4) UI checks (browser)

Using the staging web app URL (replace with yours):

- [ ] Log in as the **dev** user. Open `/ops/security-monitor` (or the path configured via `SECURITY_DASHBOARD_ROUTE` / `getSecurityDashboardRoute()`). The security dashboard should load without the “Access denied” gate.
- [ ] Log in as a normal **user**. Navigate to the same path. You should see the access denied state (no exposure of security APIs in the UI for that role).
- [ ] From the **dev** session, change filters (time range, path, IP) and confirm tables or empty states still load without unexpected errors (network tab: `api/security/*` responses `200`).

## 5) Optional hardening smoke tests

- [ ] Confirm security-related response headers appear on normal responses (e.g. `Content-Security-Policy` present), if you rely on them in staging.
- [ ] If you use email alerts for security events, trigger a controlled suspicious probe in staging (per your runbook) and confirm alert routing to a safe mailbox.

## Sign-off

- [ ] All required boxes above checked for staging.
- [ ] No production database URL or production secrets were used during `assign-dev-role` dry runs or applies.
