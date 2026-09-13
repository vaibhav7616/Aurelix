# Aurelix — Trading Engine

Code: `backend/src/trading/optionsEngine.ts` (fixed-time trades — the product), `trading/executionEngine.ts`,
`services/pnlService.ts`, `trading/slTpMonitor.ts` (legacy CFD path, still available under `/orders`, `/positions`),
`market/DemoMarketProvider.ts`.

## Fixed-time trades (`optionsEngine`) — Quotex-style flow

The terminal is a **fixed-time / binary-options** flow: the trader picks an **expiry time** (5s … 4h), an
**investment** (min `Asset.minOrder`, default $1) and presses **Up** or **Down**. Each asset carries a
`payoutPct` (admin-editable, e.g. EUR/CHF 60 %, BTC/USD 85 %).

1. **Open** (`openOption`) — one DB transaction:
   - asset must exist and be enabled; stake within `minOrder..maxOrder`; risk engine (`evaluateRisk`) runs with running
     options counted as open positions (daily-loss / max-open limits apply);
   - entry price = provider **mid** at the moment of the click (client never sends a price);
   - `Account.balance -= stake`, `WalletTransaction(TRADE, −stake, reference = option id)`;
   - `BinaryOption` row created with `status = OPEN`, `expiresAt = openedAt + durationSec`;
   - idempotent via `Idempotency-Key` (replays return the same option, no second debit);
   - emits `option:opened` + `balance:updated` to the user's socket room; audit `OPTION_OPEN`.
2. **Run** — nothing is mutated while the trade runs. Clients show a live win/lose preview from ticks.
3. **Settle** (`settleOption`) — triggered by the market tick (`settleExpired` on every tick) **and** an independent
   250 ms loop so expiry fires even if ticks pause. Runs in a transaction, idempotent per option:
   - `closePrice` = provider mid at expiry (halted asset → entry price → TIE);
   - `UP` wins if `close > entry`, `DOWN` wins if `close < entry`, `close == entry` → `TIE`;
   - **WON** → credit `stake × (1 + payoutPct/100)` (profit = `+stake × payoutPct%`);
     **TIE** → refund `stake` (profit 0); **LOST** → no credit (profit = `−stake`);
   - ledger row `WalletTransaction(TRADE, +credit)` when credit > 0; audit `OPTION_WON|LOST|TIE`;
   - emits `option:settled`, `balance:updated`, and a `TRADE` notification.
4. **Reporting** — `GET /options/history` (result filter), `GET /options/stats` (wins/losses/ties, win rate, today/total
   P/L, turnover), admin `GET /admin/options` (platform-wide) and house metrics in `GET /admin/overview`.

Pure helpers `settleOutcome`, `optionProfit`, `settlementCredit` are unit-tested in `tests/options.test.ts`.

## Market feed & candles (`market/DemoMarketProvider.ts`) — how the chart behaves

The feed is built to behave like a fixed-time-trade broker feed (Quotex-style):

| Property | Behaviour |
|---|---|
| Quote rate | `DEMO_TICK_INTERVAL_MS` (default **250 ms**) — the live candle visibly moves several times per second |
| Timeframes | `5s 10s 15s 30s 1m 5m 15m 30m 1h 4h 1d` — one price series feeds all of them |
| Buckets | strict `[open, open+tf)` windows aligned to the wall clock (a 1m candle always starts at :00) |
| Gap-free | every candle opens at the previous candle's close; skipped buckets are bridged with flat candles |
| Consistency | a 1m candle is exactly the aggregate of its 12 × 5s candles (verified in `tests/market.test.ts`) |
| Precision | quotes rounded to the instrument pip (5 dp FX, 3 dp JPY, 2 dp crypto/metals) → ties are possible, like a real feed |
| Dynamics | mean-reverting random walk with volatility clustering, momentum bursts and occasional flat ticks; hard band around `Asset.basePrice` |
| Lifecycle events | `market:candle {…, event:'close'|'open'}` is pushed the instant a bucket rolls; the client rolls its live bar on that event (clock fallback if missed) |
| History | `GET /market/candles?symbol&timeframe&limit` (≤1000) and `GET /market/timeframes` |

Client side (`components/charts/PriceChart.tsx`): history is loaded once per symbol/timeframe; afterwards the live
candle is built tick-by-tick (O = previous close, H/L/C from quotes) and rolled on the server's candle event —
the series is never re-fetched on every tick. The legend shows the time left in the current candle. Before a
trade is opened the chart previews the trade window for the expiry selected in the ticket ("Beginning of trade /
End of trade" + a time pill on the price line); once a trade is running the pill turns green/red with the live
result and counts down to expiry. If the websocket is blocked or a tab was asleep, a 1 s HTTP quote watchdog keeps
the live candle moving until the socket recovers (transport starts as long-polling and upgrades to websocket). All
countdowns (candle and trade expiry) run on the **server clock** (offset learned from tick timestamps), so the
"End of trade" line and the settlement moment agree.

## Legacy CFD path

### Order lifecycle

`PENDING → OPEN → CLOSED` (`CANCELLED`/`REJECTED` reserved for future order-book types).
Market orders execute immediately at the current quote: BUY lifts the ask, SELL hits the bid.

### Execution (`executeOrder`)

1. Idempotency replay check (`Idempotency-Key` → stored response or existing order).
2. Load account (must belong to caller) + asset; fetch live tick (missing/disabled → `ASSET_DISABLED`).
3. Build risk context: available = balance − locked; open count; today's + total realized P&L.
4. `evaluateRisk` (throws structured codes) + asset min/max + SL/TP sanity vs execution price.
5. `quantity = amount / execPrice`; `fee = amount × feeBps / 10_000`.
6. Atomic write: `Order(OPEN) + Position(OPEN, uP&L=−openFee) + IdempotencyKey`.
7. Persist idempotency response; emit `order:created`, `position:opened`; notify + audit.

### P/L (`pnlService`)

- BUY: `(mark − entry) × qty`; SELL: `(entry − mark) × qty`.
- Fees in basis points per asset, applied on notional; `netPnl` returns `{gross, fee, net}`.
- `exceedsSlTp` implements directional trigger predicates — shared by monitor and close paths.

### SL/TP monitor (`slTpMonitor.onMarketTick`)

On every tick: load OPEN positions for the symbol (bounded batch) → reprice + update `unrealizedPnl`
→ check triggers → auto-close in a transaction (position, order, trade with `closeReason SL|TP`,
ledger `TRADE` + informational `FEE`, balance update) → `position:closed` + `balance:updated` → notify + audit.
The monitor never throws — tick path is failure-isolated.

## Demo market (`DemoMarketProvider`)

Geometric-Brownian-motion-ish ticks per asset (own volatility/spread/enabled), 1s interval,
6 timeframe candle builders (1m–1d) with seeded 180-candle history, Redis caching, best-effort 1m persistence,
`testSetPrice` hook for integration tests. All payloads carry `demo: true`; UI labels `DEMO MARKET`.

## LIVE path

`accountType=LIVE` is rejected with `LIVE_TRADING_DISABLED` until a licensed `ExternalMarketProvider`
and execution/custody wiring replace the stubs behind the same interfaces.
