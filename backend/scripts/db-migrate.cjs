#!/usr/bin/env node
/**
 * Aurelix — database migration entrypoint (dev + prod).
 *
 * Runs `prisma migrate deploy` (idempotent: applies only pending migrations) and
 * transparently BASELINES databases that were created by the previous
 * `prisma db push` entrypoint, so an existing `pgdata` volume upgrades in place.
 *
 * Why this exists: `db push` refuses to add the unique `User.username` column to a
 * populated table without `--accept-data-loss`, so after `git pull` the backend
 * container crash-looped and every API call surfaced in the UI as
 * "Request failed with status code 502".
 *
 * Database states handled:
 *   1. empty database                                   -> apply all migrations
 *   2. migration history present (`_prisma_migrations`) -> apply pending migrations
 *   3. schema created by `db push` BEFORE `username`     -> baseline `init`, apply the rest
 *   4. schema created by `db push` WITH `username`       -> baseline everything, nothing to apply
 *
 * Usage:  node scripts/db-migrate.cjs        (DATABASE_URL must be set)
 * Env:    DB_WAIT_TIMEOUT_MS (default 60000) — how long to wait for Postgres.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations');
const DB_WAIT_MS = parseInt(process.env.DB_WAIT_TIMEOUT_MS || '60000', 10);

/**
 * Sentinel queries used ONLY to baseline a database that pre-dates the migrations
 * folder: "is the effect of this migration already present?". Keyed by migration
 * folder name. Only migrations that could already exist on a `db push`-managed
 * database need an entry; migrations created after this file was introduced don't.
 */
const BASELINE_PROBES = {
  '20260907110735_init':
    "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'User'",
  '20260907132127_add_user_username':
    "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'username'",
};

const log = (msg) => console.log(`[db-migrate] ${msg}`);

/** Run the Prisma CLI installed in node_modules (falls back to npx if it is missing). */
function prismaCli(...args) {
  let cli = null;
  try {
    cli = require.resolve('prisma/build/index.js', { paths: [ROOT] });
  } catch {
    /* not installed locally */
  }
  const env = { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' };
  const r = cli
    ? spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', cwd: ROOT, env })
    : spawnSync('npx', ['prisma', ...args], { stdio: 'inherit', cwd: ROOT, env, shell: true });
  return r.status === null ? 1 : r.status;
}

async function rowExists(db, sql) {
  const rows = await db.$queryRawUnsafe(sql);
  return Array.isArray(rows) && rows.length > 0;
}

async function waitForDatabase(db) {
  const deadline = Date.now() + DB_WAIT_MS;
  for (let attempt = 1; ; attempt++) {
    try {
      await db.$queryRawUnsafe('SELECT 1');
      return;
    } catch (e) {
      if (Date.now() >= deadline) {
        const reason = e && e.message ? e.message.split('\n')[0] : String(e);
        throw new Error(`database not reachable after ${DB_WAIT_MS}ms: ${reason}`);
      }
      if (attempt === 1 || attempt % 5 === 0) log(`waiting for database... (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(MIGRATIONS_DIR, d.name, 'migration.sql')))
    .map((d) => d.name)
    .sort();
}

/** Names of migrations already recorded as successfully applied (empty set if no history table). */
async function recordedMigrations(db) {
  const hasHistory = await rowExists(
    db,
    "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = '_prisma_migrations'",
  );
  if (!hasHistory) return new Set();
  const rows = await db.$queryRawUnsafe(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  );
  return new Set(rows.map((r) => r.migration_name));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  let PrismaClient;
  try {
    ({ PrismaClient } = require('@prisma/client'));
  } catch (e) {
    throw new Error(`@prisma/client is not generated — run "npx prisma generate" first (${e.message})`);
  }
  const db = new PrismaClient({ log: [] });

  const toBaseline = [];
  try {
    await waitForDatabase(db);
    const recorded = await recordedMigrations(db);
    const migrations = listMigrations();
    if (migrations.length === 0) throw new Error(`no migrations found in ${MIGRATIONS_DIR}`);

    // Walk history in order. A migration that is not recorded but whose effect is already
    // present in the database was applied out-of-band (old `db push` entrypoint) -> baseline it.
    // Stop at the first migration that is genuinely missing; `migrate deploy` applies the rest.
    for (const name of migrations) {
      if (recorded.has(name)) continue;
      const probe = BASELINE_PROBES[name];
      if (!probe || !(await rowExists(db, probe))) break;
      toBaseline.push(name);
    }

    if (recorded.size === 0 && toBaseline.length === 0) log('empty database — applying all migrations');
    else if (toBaseline.length === 0) log('migration history found — applying pending migrations');
    else {
      log(
        `schema objects exist without migration history (database was created with "prisma db push"). ` +
          `Baselining ${toBaseline.length}/${migrations.length} migration(s) as already applied...`,
      );
    }
  } finally {
    await db.$disconnect().catch(() => undefined);
  }

  for (const name of toBaseline) {
    log(`  resolve --applied ${name}`);
    const code = prismaCli('migrate', 'resolve', '--applied', name);
    if (code !== 0) throw new Error(`failed to baseline migration ${name} (exit ${code})`);
  }

  const code = prismaCli('migrate', 'deploy');
  if (code !== 0) throw new Error(`prisma migrate deploy failed (exit ${code})`);
  log('database schema is up to date');
}

main().catch((e) => {
  console.error(`[db-migrate] FATAL: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
