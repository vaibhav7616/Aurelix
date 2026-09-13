# Aurelix — Demo Trading Platform

**Aurelix** is a complete, original full-stack web trading platform built around **fixed-time (Quotex-style) trades**:
pick an expiry time and an investment, press **Up** or **Down**, and the trade settles automatically at expiry with a
fixed payout per asset. Public website, authenticated trading terminal, demo market engine, options/risk engines,
wallet ledger, withdrawals workflow, admin control deck, real-time websockets — all running on Docker.

> **Demo/simulated environment.** All prices and funds are simulated for education and strategy testing.
> Live brokerage execution is architecturally **disabled** until a licensed execution provider is connected.
> Nothing here is financial advice.

Brand: **Aurelix** · `aurelix.trade` · Logo: aurora-prism "A" (`frontend/public/logo.svg`)

---

## 1. Requirements

- Docker Engine 24+ with Compose v2
- 4 GB RAM recommended · ports 80, 4000, 5173, 5432, 6379 free

## 2. Environment setup

```bash
git clone <repo> && cd aurelix
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET and JWT_REFRESH_SECRET (32+ chars)
```

## 3. Start everything (Docker)

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Open the app at **http://localhost** (nginx serves the UI and proxies `/api` + `/socket.io` to the backend —
same origin, so no CORS issues). After `git pull`, rebuild: `docker compose up -d --build`.

| Surface | URL |
|---|---|
| Website + app (nginx) | http://localhost |
| Frontend (dev) | http://localhost:5173 |
| Backend API | http://localhost:4000 |
| Health / Ready | http://localhost:4000/health · `/ready` |
| Admin | http://localhost/admin (or :5173/admin) |

## 4. Database

Schema changes are versioned in `backend/prisma/migrations/` and applied automatically on container start
(dev **and** prod) by `backend/scripts/db-migrate.cjs`, which runs `prisma migrate deploy` and transparently
baselines volumes that were created by the old `prisma db push` entrypoint — existing data upgrades in place,
no `docker compose down -v` needed.

```bash
# After changing schema.prisma: create a migration (writes prisma/migrations/<ts>_<change>/migration.sql)
docker compose exec backend npx prisma migrate dev --name <change>
docker compose exec backend node scripts/db-migrate.cjs   # apply pending migrations manually
docker compose exec backend npx prisma db seed
docker compose exec backend npx prisma studio
```

> Never use `prisma db push` against a database with data — it refuses schema changes it considers unsafe
> (e.g. adding a unique column) and the API container would crash-loop, surfacing as **502** errors in the UI.

## 5. Seed data & test credentials

Seeded automatically on first start (`prisma/seed.ts`):

| Role | Username | Email | Password |
|---|---|---|---|
| Demo trader (USER) | `demo` | `demo@example.com` | `Demo123!` |
| Admin (ADMIN) | `admin` | `admin@aurelix.trade` | `admin123` |

Assets: BTC/USD, ETH/USD, EUR/USD, GBP/USD, USD/JPY, XAU/USD · Demo balance: $10,000 (configurable via `DEMO_STARTING_BALANCE`).

## 6. Production deployment

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Set real secrets, restrict published ports, terminate TLS at nginx (mount certs), and set `MARKET_PROVIDER`/`PAYMENT_PROVIDER`
only after licensing. See [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 7. Repo map

```
aurelix/
├── backend/        # Express + Prisma + Socket.IO + trading/market/risk engines
├── frontend/       # React + Vite + Tailwind + TanStack Query + Zustand + lightweight-charts
├── nginx/          # Edge proxy (/, /api/, /socket.io/)
├── docs/           # Architecture, API, DB, engines, security, testing, deployment
├── docker-compose.yml / .dev.yml / .prod.yml
└── .env.example
```

## 8. Definition of done — all implemented

Brand & original UI · public site · register/login/logout/refresh/change-password · dashboard stats ·
demo accounts · asset list with per-asset payout % · demo market engine · live ticks/candles ·
fixed-time Up/Down trades (5s–4h, min $1) · server-fixed entry price · automatic settlement at expiry (WON/LOST/TIE) ·
running-trades list with countdown · chart trade markers (start/end/entry) · backend validation · risk engine ·
balance updates · trade history & stats · admin payout control + platform-wide trade monitor ·
wallet ledger · deposits (demo provider) · withdrawal review workflow · notifications · websockets · admin deck ·
asset/risk/user management · audit logs · idempotent orders · DB transactions · automated tests · Docker dev+prod ·
nginx · health checks · docs.

Further reading: [ARCHITECTURE](docs/ARCHITECTURE.md) · [API](docs/API.md) · [DATABASE](docs/DATABASE.md) ·
[TRADING_ENGINE](docs/TRADING_ENGINE.md) · [RISK_ENGINE](docs/RISK_ENGINE.md) · [SECURITY](docs/SECURITY.md) · [TESTING](docs/TESTING.md) · [DEPLOYMENT](docs/DEPLOYMENT.md)
