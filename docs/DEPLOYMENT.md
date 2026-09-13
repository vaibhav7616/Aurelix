# Aurelix — Deployment

## Development

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f backend frontend
```

## Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Prod differences: `production` build targets, no bind mounts, `restart: always`,
`node scripts/db-migrate.cjs` entrypoint (`prisma migrate deploy` + baseline of pre-migration volumes), unexposed postgres/redis ports.

## Checklist

- [ ] Strong `JWT_SECRET` / `JWT_REFRESH_SECRET` (64 hex chars), unique `POSTGRES_PASSWORD`
- [ ] `NODE_ENV=production`, `LOG_LEVEL=info`
- [ ] TLS at nginx (mount `/etc/nginx/certs`, add 443 server block + redirect)
- [ ] Tighten CORS `CORS_ORIGINS` to the real domain(s), comma-separated
- [ ] Persistent volumes `pgdata`/`redisdata` on durable disks + DB backup job
- [ ] `docker compose exec backend npx prisma db seed` only for demo data — skip/empty in prod
- [ ] Health: `GET /health` (liveness), `GET /ready` (postgres+redis) — wire to orchestrator probes
- [ ] Set `MARKET_PROVIDER`/`PAYMENT_PROVIDER` to licensed providers only after compliance sign-off

## Operations

```bash
docker compose ps
docker compose logs -f --tail=200 backend
docker compose exec backend npx prisma studio   # careful in prod
docker compose down          # keep volumes
docker compose down -v       # DANGER: deletes database
```

## Troubleshooting

### Login (or any API call) shows `Request failed with status code 502`
A 502 comes from the edge proxy (nginx / preview server): the UI is up but the **backend container is not
listening**. Check it:

```bash
docker compose ps                      # backend "Restarting"? → it is crash-looping on startup
docker compose logs --tail=100 backend
```

Typical cause: the DB entrypoint failed, so `npm run dev` never started. Before the versioned-migrations
entrypoint (`scripts/db-migrate.cjs`), `prisma db push` refused to add the unique `User.username` column to an
existing volume and the container restarted forever. Pull the latest code and rebuild:

```bash
git pull
docker compose up -d --build backend
docker compose logs -f backend         # expect: "[db-migrate] database schema is up to date" → "aurelix backend listening"
```

Other things to verify when you see 502s:
- `docker compose exec backend wget -qO- http://localhost:4000/health` returns `{"success":true,...}`
- `curl -s http://localhost/ready` reports `postgres: true` and `redis: true`
- `.env` `DATABASE_URL` points at the `postgres` service host (not `localhost`) when running in compose
