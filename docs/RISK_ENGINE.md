# Aurelix — Risk Engine

Code: `backend/src/risk/riskEngine.ts`. Rules live in `risk_rules(key='global')`, editable at
`PUT /api/v1/admin/risk` — nothing is hardcoded in the order path.

## Checks (in order)

| # | Check | Error |
|---|---|---|
| 1 | Global `tradingEnabled` | `TRADING_DISABLED` |
| 2 | Account `ACTIVE` | `ACCOUNT_SUSPENDED` |
| 3 | Asset `enabled` | `ASSET_DISABLED` |
| 4 | Account is not LIVE (until licensed) | `LIVE_TRADING_DISABLED` |
| 5 | Amount finite & > 0, ≥ min, ≤ max order | `INVALID_AMOUNT` / `MAX_ORDER_SIZE` |
| 6 | Amount ≤ max position | `MAX_POSITION_SIZE` |
| 7 | Amount ≤ available (balance − locked) | `INSUFFICIENT_BALANCE` |
| 8 | Open count < max | `MAX_OPEN_POSITIONS` |
| 9 | Today realized P&L > −maxDailyLoss | `MAX_DAILY_LOSS` |
| 10 | Total realized P&L > −maxTotalLoss | `MAX_TOTAL_LOSS` |

Asset-level `minOrder`/`maxOrder` apply after global rules. SL/TP must be on the valid side of the
execution price (BUY: SL < entry < TP; SELL mirrored).

## Design notes

- `evaluateRisk(ctx, rules)` is **pure** (throws `ApiError`) — unit-tested without a database.
- `getRiskRules()` falls back to safe defaults if the DB is unreachable (fail-closed for trading? No:
  fail-safe defaults mirror production values; global kill-switch remains available via DB).
- Daily loss window resets at local-midnight server time; uses realized P&L only.
- Future: per-user overrides, symbol exposure caps, kill-switch schedules, margin model.
