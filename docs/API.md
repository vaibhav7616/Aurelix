# Aurelix — API Reference (`/api/v1`)

Envelope: `{ success, data, error: { code, message, details } | null }`.
Auth: `Authorization: Bearer <accessToken>` (15m) + refresh rotation. Orders accept `Idempotency-Key`.

## Auth `/auth`
- `POST /register` {email,password,firstName,lastName} → 201 — creates user + funded DEMO account
- `POST /login` {identifier|email, password} → {accessToken, refreshToken, user} — identifier accepts username or email
- `POST /refresh` {refreshToken} → {accessToken}
- `POST /logout` · `GET /me` · `POST /forgot-password` · `POST /change-password` · `GET /sessions`

## Users `/users` — `GET /profile`, `PATCH /profile`

## Accounts `/accounts`
- `GET /` — accounts with live equity (balance + Σ unrealized)
- `POST /` — new DEMO account (LIVE → `LIVE_TRADING_DISABLED`)
- `GET /:id/stats` — balance, equity, today/total P&L, open count, wins/losses, win rate

## Assets `/assets` (public) — list + live ticks + `demo` flag + `tradingHours` (24/7 crypto vs weekday FX/metals)

## Market `/market` (public)
- `GET /timeframes` → {timeframes:[{key,ms}], serverTime} — `5s 10s 15s 30s 1m 5m 15m 30m 1h 4h 1d`
- `GET /status` — feed status (provider, symbols, server time, tick ages)
- `GET /ticks?symbols=BTC/USD,ETH/USD` · `GET /tick/:symbol` · `GET /candles?symbol&timeframe&limit` (timeframes: 1m 5m 15m **30m** 1h 4h 1d)
- `GET /stats?symbol=` — live bid/ask/mid/spread + 24h change, high/low, volume

## Options `/options` — fixed-time (Quotex-style) trades (auth)
- `GET /config` → {durations, minDurationSec, maxDurationSec, serverTime, assets:[{symbol,payoutPct,minStake,maxStake,enabled}]}
- `POST /` {accountId,symbol,direction:UP|DOWN,stake,durationSec 5..14400} + `Idempotency-Key` (rate-limited)
  → 201 option + `balance` (replay → 200 with `replayed:true`). Stake is debited immediately; entry = server mid at click.
- `GET /open?accountId` — running trades (status OPEN) with entry/expiry
- `GET /history?page&pageSize&accountId&result=WON|LOST|TIE` — settled trades, newest first
- `GET /stats?accountId` → {openTrades,inTrade,totalTrades,wins,losses,ties,winRate,todayPnl,totalPnl,turnover}
- `GET /:id`
- Option shape: {id,symbol,direction,stake,payoutPct,entryPrice,closePrice,profit,durationSec,openedAt,expiresAt,settledAt,status:OPEN|WON|LOST|TIE,accountId}

## Orders `/orders` (legacy CFD path, auth, rate-limited)
- `POST /` {accountId,symbol,side,amount,stopLoss?,takeProfit?} + `Idempotency-Key` → {orderId,positionId,entryPrice}
- `GET /` — paginated, filters: side, status, symbol

## Positions `/positions` (legacy CFD path)
- `GET /open?accountId` — live mark + uP&L (server-computed)
- `POST /close` {positionId} → {exitPrice,realizedPnl,fee,balance}
- `PATCH /sltp` {positionId,stopLoss?,takeProfit?}

## Trades `/trades` (legacy CFD path) — paginated history; filters: symbol, side, from/to, profit=win|loss

## Wallet `/wallet`
- `GET /:accountId` — balance/locked/available
- `GET /:accountId/transactions?type=` — ledger (paginated)
- `POST /deposit` {accountId,amount,currency} — via `PaymentProvider` (demo completes instantly, simulated)

## Payments `/payments` — deposit list · Withdrawals `/withdrawals` — `GET /`, `POST /` (locks funds → REQUESTED)

## Notifications `/notifications` — `GET /` (unread count), `POST /:id/read`, `POST /read-all`

## Admin `/admin` (ADMIN+)
- `GET /overview` — users, accounts, positions, volume, fees, P&L, deposits, withdrawals
- `GET /users?search` · `GET /users/:id` · `POST /users/:id/suspend|activate`
- `POST /adjust` {accountId,amount,reason} — audited balance adjustment
- `GET /assets` · `PUT /assets` (upsert incl. enabled/volatility/spread/fees/limits)
- `GET /risk` · `PUT /risk` (global rule set)
- `GET /withdrawals?status` · `POST /withdrawals/:id/review` {action: approve|reject|process|complete, note?}
- `GET /accounts` · `GET /positions` (all open, with owner) · `GET /deposits`
- `GET /market` (engine status + live ticks) · `POST /market/reload`
- `POST /notifications/broadcast` {title, message} → all active users
- `GET /options?status=OPEN|CLOSED&page&pageSize` — platform-wide fixed-time trades (owner, account, result)
- `PUT /assets` accepts `payoutPct` (1–100) — the payout applied to new trades on that asset
- `GET /overview` also returns openOptions, settledOptions, optionTurnover, optionClientPnl, houseEdge, optionWinRate
- `GET /orders` · `GET /trades` · `GET /audit` (paginated) · `GET /settings` · `PUT /settings`

## WebSocket (Socket.IO, auth via `auth.token`)
- Client → `market:subscribe|unsubscribe` [symbols]
- Server → `market:tick` (≈4/s per subscribed symbol), `market:candle` ({…candle, event:'close'|'open'} when a bucket rolls), `option:opened`, `option:settled`, `order:created`, `position:opened|updated|closed`, `balance:updated`, `notification:new`

## Error codes
`VALIDATION_ERROR UNAUTHORIZED FORBIDDEN NOT_FOUND CONFLICT INSUFFICIENT_BALANCE MAX_ORDER_SIZE
MAX_POSITION_SIZE MAX_OPEN_POSITIONS MAX_DAILY_LOSS MAX_TOTAL_LOSS TRADING_DISABLED ASSET_DISABLED
ACCOUNT_SUSPENDED USER_SUSPENDED INVALID_AMOUNT INVALID_JSON LIVE_TRADING_DISABLED RATE_LIMITED INTERNAL_ERROR`
