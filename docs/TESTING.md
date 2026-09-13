# Aurelix — Testing

## Backend (`backend/tests/`, Vitest)

```bash
cd backend
npm ci && npx prisma generate
npm test            # unit + integration
npm run test:watch
```

| File | Covers |
|---|---|
| `pnl.test.ts` | BUY/SELL P&L signs, fees, SL/TP predicates (8 cases) |
| `risk.test.ts` | all 10 risk gates incl. LIVE block (10 cases) |
| `idempotency.test.ts` | key normalization, UUID uniqueness |
| `trading.integration.test.ts` | full lifecycle: user → funded demo account → BUY BTC/USD → price-up P&L>0 → price-down P&L<0 → SL trigger → TP trigger → ledger + history (needs Postgres; skips gracefully without it) |

Run the integration suite against real infra:

```bash
docker compose up -d postgres redis
DATABASE_URL=postgresql://aurelix:aurelix_dev_secret@localhost:5432/aurelix?schema=public npm test
```

## Manual QA script (5 min)

1. Register → auto-funded $10,000 → dashboard shows equity.
2. Trading → BUY BTC/USD $100 with SL/TP → position appears, uP&L ticks live.
3. Close manually → balance + history + ledger update without refresh.
4. Wallet → deposit $500 (simulated) → withdraw $50 → admin `/admin/withdrawals` approve → process → complete.
5. Admin → halt XAU/USD → ticket for XAU/USD rejects with `ASSET_DISABLED`; re-enable.
6. Admin → set max open positions = 1 → second order rejected with `MAX_OPEN_POSITIONS`; restore 20.
7. Double-click BUY (or replay `Idempotency-Key`) → single order created.

## Frontend

```bash
cd frontend && npm ci && npm run build   # typecheck (strict) + production bundle
```
