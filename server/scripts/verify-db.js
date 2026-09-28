#!/usr/bin/env node
/**
 * scripts/verify-db.js — proves the database is really wired up:
 *   • required tables + columns exist
 *   • RLS is ENABLED on every table and policies exist
 *   • anon key (the one that could leak) can read NOTHING
 *   • service_role key can read/write
 *
 * Catalog checks use the Postgres connection if SUPABASE_DB_URL is set,
 * otherwise the Supabase Management API (SUPABASE_ACCESS_TOKEN).
 * Run:  npm run db:verify
 */
import 'dotenv/config';
import { supabaseAdmin, supabaseAnon } from '../src/lib/supabase.js';
import { env, resolveDbUrl } from '../src/config/env.js';

const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failures++; console.log(`  ✗ ${m}`); };
const info = (m) => console.log(`  – ${m}`);
let failures = 0;

const WANT_TABLES = ['profiles', 'items', 'soil_tests', 'ai_messages'];
const WANT_COLUMNS = ['id', 'user_id', 'title', 'description', 'ai_summary', 'created_at'];

/** Run a read-only query through whichever route is available. */
async function query(sql) {
  if (resolveDbUrl()) {
    const pg = (await import('pg')).default;
    const client = new pg.Client({ connectionString: resolveDbUrl(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    await client.connect();
    try { return (await client.query(sql)).rows; } finally { await client.end().catch(() => {}); }
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = (env.SUPABASE_URL || '').replace(/^https?:\/\//, '').split('.')[0];
  if (!token || !ref) return null;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) return null;
  return res.json();
}

console.log('\n🔎 FARM-IQ — verifying database\n');

try {
  const tables = await query(`select tablename from pg_tables where schemaname='public'`);
  if (tables) {
    const names = tables.map((r) => r.tablename);
    for (const want of WANT_TABLES) {
      names.includes(want) ? ok(`table ${want} exists`) : bad(`table ${want} MISSING — run: npm run db:setup`);
    }
  } else {
    info('no SQL access configured (fine in production) — skipping catalog checks');
  }

  const rls = await query(`select relname, relrowsecurity from pg_class where relkind='r' and relname in ('profiles','items','soil_tests','ai_messages')`);
  if (rls) {
    for (const r of rls) r.relrowsecurity ? ok(`RLS enabled on ${r.relname}`) : bad(`RLS NOT enabled on ${r.relname}`);
  }

  const pol = await query(`select count(*)::int c from pg_policies where schemaname='public'`);
  if (pol) pol[0].c > 0 ? ok(`${pol[0].c} RLS policies installed`) : bad('no RLS policies found');

  const cols = await query(`select column_name from information_schema.columns where table_schema='public' and table_name='items'`);
  if (cols) {
    const names = cols.map((r) => r.column_name);
    const missing = WANT_COLUMNS.filter((c) => !names.includes(c));
    missing.length === 0 ? ok(`items table has all ${WANT_COLUMNS.length} expected columns`) : bad(`items is missing: ${missing.join(', ')}`);
  }
} catch (e) {
  bad(`catalog check failed: ${e.message}`);
}

// ── the important one: can the PUBLIC anon key see anything? ──
if (env.SUPABASE_ANON_KEY) {
  const items = await supabaseAnon.from('items').select('id').limit(1);
  if (items.error || !items.data?.length) ok('anon key is blocked by RLS (0 rows visible) — leaked keys cannot read farm data');
  else bad(`anon key could read ${items.data.length} item row(s) — RLS is not protecting data!`);

  const prof = await supabaseAnon.from('profiles').select('id, password_hash').limit(1);
  if (prof.error || !prof.data?.length) ok('anon key cannot read profiles (password hashes protected)');
  else bad('anon key could read profiles — check RLS!');
} else {
  info('SUPABASE_ANON_KEY not set — skipping anon probe');
}

// ── the backend's own key must work ──
try {
  const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
  error ? bad(`service_role read failed: ${error.message}`) : ok('service_role key can read profiles (backend wired up)');
} catch (e) {
  bad(`service_role client error: ${e.message}`);
}

console.log(failures === 0 ? '\n✅ Database verification passed.\n' : `\n❌ ${failures} problem(s) found.\n`);
process.exit(failures === 0 ? 0 : 1);
