# Aurelix — Database

PostgreSQL 16 via Prisma. Schema: `backend/prisma/schema.prisma`. Migrations live in `backend/prisma/migrations/`
(create with `prisma migrate dev --name <change>`); the container entrypoint `scripts/db-migrate.cjs` applies them with
`prisma migrate deploy` in both dev and prod, and baselines databases that were originally created with `prisma db push`.
Persistent volume `pgdata` — data survives container rebuilds and schema upgrades.

## Tables

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | identity, role, status | `email UNIQUE`, status index |
| `sessions` | refresh sessions | `refreshToken UNIQUE`, revocable |
| `accounts` | DEMO/LIVE wallets | `accountNumber UNIQUE`, `balance Decimal(18,2)` |
| `assets` | instruments + engine params | `symbol UNIQUE`, enabled/category indexes |
| `market_candles` | persisted 1m candles | `UNIQUE(symbol,timeframe,openTime)` |
| `orders` | order intents + fills | `idempotencyKey UNIQUE`, status index |
| `positions` | open/closed exposure | `orderId UNIQUE`, status index |
| `trades` | closed-trade record | `positionId UNIQUE`, closedAt index |
| `wallets`→`wallet_transactions` | immutable-style ledger | accountId/type/createdAt indexes |
| `deposits` | deposit intents + provider refs | status index |
| `withdrawals` | review workflow | status index |
| `payment_transactions` | provider audit rows | userId index |
| `risk_rules` | global rule set (`key=global`) | `key UNIQUE` |
| `notifications` | user alerts | userId/read indexes |
| `audit_logs` | security/admin trail (no secrets) | action/entity/createdAt indexes |
| `system_settings` | KV settings | key PK |
| `idempotency_keys` | replay store | key PK, TTL via expiresAt |

## Transaction patterns

- **Order open**: `order + position + idempotencyKey` in one `$transaction`.
- **Close / auto-close**: `position + order + trade + walletTransaction(s) + account.balance` in one `$transaction`.
- **Deposit**: `account.balance + walletTransaction + deposit` in one `$transaction`.
- **Withdrawal request**: `account.lockedBalance + withdrawal` in one `$transaction`.
- **Withdrawal complete**: `lockedBalance −, balance −, walletTransaction, withdrawal` in one `$transaction`.

Money uses `Decimal(18,2)` (prices `Decimal(18,6)`, quantities `Decimal(18,8)`). Reads cast to `number` at API boundary.
