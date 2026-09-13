# Aurelix — Security

## Authentication & sessions
- bcrypt password hashing (12 rounds); never stored or logged in plaintext.
- Short-lived JWT access tokens (15m) + 7-day refresh tokens persisted as revocable `sessions`.
- Refresh rotation on use-path via axios interceptor; `change-password` revokes all sessions.
- WebSocket handshake verifies the access token and checks `SUSPENDED`.

## Authorization
- `requireAuth` on all private routes; `requireAdmin` (ADMIN/SUPER_ADMIN) on `/admin/*`.
- Users can only touch their own accounts/positions (every query scoped by `userId`).
- Socket rooms: users join only `user:{self}`; market rooms are symbol-scoped.

## Edge & abuse
- Helmet headers + nginx security headers, CORS allowlist, gzip, request IDs.
- Rate limits: global API, stricter auth (30/min), orders (20/10s).
- Zod validation on every mutating route; 256 KB JSON cap.

## Financial integrity
- Backend re-prices every order at the live quote; client prices ignored.
- All money mutations inside Prisma transactions with ledger rows; idempotency keys prevent double-fills.
- Admin adjustments require reason + admin identity + audit row.

## Logging & secrets
- Pino with redaction (`password`, `token`, `secret`, `authorization`); financial events structured-logged.
- Secrets only in env/Docker secrets — never in the frontend bundle or logs.
- Audit log covers login, password changes, orders, closes, deposits, withdrawals, adjustments, admin actions.

## Pre-launch hardening checklist
TLS, secret rotation, DB backups + PITR, WAF, dependency scanning, pen-test, licensing/compliance review.
