# Aurelix — Architecture

## Topology

```
Browser ──▶ Nginx (:80)
              ├─▶ /            → frontend:5173 (React SPA)
              ├─▶ /api/        → backend:4000  (Express REST)
              └─▶ /socket.io/  → backend:4000  (Socket.IO, WS upgrade)
backend ──▶ postgres:5432 (Prisma) · redis:6379 (ticks/candles cache)
backend owns: MarketEngine → TradingEngine → RiskEngine → PnL → SL/TP monitor → Ledger → WebSocket fan-out
```

## Backend modules (`backend/src/`)

| Dir | Responsibility |
|---|---|
| `config/` | env, Prisma singleton, Redis client with memory fallback |
| `market/` | `MarketDataProvider` interface, `DemoMarketProvider` (GBM ticks, candle builder), external stub |
| `services/marketService` | provider lifecycle, tick fan-out hook |
| `trading/executionEngine` | `executeOrder`, `closePosition` — atomic order/position/ledger writes, idempotency |
| `trading/slTpMonitor` | per-tick SL/TP scan, auto-close txn, events |
| `risk/` | `getRiskRules` (DB) + pure `evaluateRisk` |
| `services/pnlService` | gross/net P&L, fees, SL/TP trigger predicates |
| `wallet/ledger` | `appendLedger` — every balance mutation + `wallet_transactions` row |
| `payments/` | `PaymentProvider` interface + `DemoPaymentProvider` |
| `websocket/` | authenticated Socket.IO, `asset:*` rooms, `user:*` rooms |
| `routes/` + `schemas/` + `middleware/` | REST surface, Zod validation, JWT/RBAC, rate limits, errors |

## Data flow — placing an order

`POST /api/v1/orders` → auth → Zod → account+asset fetch → live quote → risk context (open count, daily/total P&L)
→ `evaluateRisk` → SL/TP sanity → fee+qty math → **Prisma `$transaction`**: order + position + idempotency row
→ store idempotency response → `order:created` + `position:opened` + notification + audit.

## Data flow — market tick

`DemoMarketProvider.tickAll()` (1s) → per-asset GBM step → roll 1m–1d candles → Redis cache + best-effort candle persist
→ `broadcastTick` (only subscribed `asset:*` rooms) → `onMarketTick`: reprice positions, update uP&L,
auto-close SL/TP (txn: position, order, trade, ledger, balance) → `position:*` + `balance:updated` to owner.

## Frontend (`frontend/src/`)

React Router (public/app/admin shells) · TanStack Query (server state, polling + WS invalidation) ·
Zustand (`authStore`, `terminalStore` ticks/symbol/account, `uiStore` toasts) · Socket.IO client
(`services/socket.ts`: auth, `market:subscribe`, event→query invalidation) · lightweight-charts wrapper with live tick overlay.

## Key invariants

1. Frontend is never authoritative for money — backend re-prices, re-validates, re-computes.
2. Every balance change has a ledger row in the same DB transaction.
3. SL/TP evaluated server-side on every tick.
4. Private events only reach owner rooms; market ticks only reach subscribed asset rooms.
