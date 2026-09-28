#!/usr/bin/env node
/**
 * scripts/bootstrap-db.js
 * Creates every FARM-IQ table, index, trigger and RLS policy automatically.
 * You never have to paste SQL into the Supabase dashboard.
 *
 * Strategies (tried in order, first one that connects wins):
 *   1. SUPABASE_DB_URL                        (full postgres:// string)
 *   2. Supabase Supavisor pooler hosts        (needs SUPABASE_DB_PASSWORD)
 *   3. Direct db.<ref>.supabase.co            (IPv6 / same-region hosts)
 *   4. Supabase Management API                (needs SUPABASE_ACCESS_TOKEN, sbp_...)
 *
 * Usage:  npm run db:setup            (from the server/ folder)
 *         npm run db:setup -- --seed  (also adds a demo account + sample records)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';
import { env } from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
const SEED = process.argv.includes('--seed');

const ref = (env.SUPABASE_URL || '').replace(/^https?:\/\//, '').split('.')[0];
const pwd = env.SUPABASE_DB_PASSWORD ? encodeURIComponent(env.SUPABASE_DB_PASSWORD) : '';

const REGIONS = [
  'aws-0-ap-south-1', 'aws-0-ap-southeast-1', 'aws-0-us-east-1', 'aws-0-us-west-1',
  'aws-0-eu-central-1', 'aws-0-ap-northeast-1', 'aws-0-eu-west-1', 'aws-0-sa-east-1',
  'aws-1-ap-south-1', 'aws-1-us-east-1', 'aws-1-ap-southeast-1',
];

const candidates = [];
if (env.SUPABASE_DB_URL) candidates.push({ label: 'SUPABASE_DB_URL from .env', url: env.SUPABASE_DB_URL });
if (ref && pwd) {
  for (const r of REGIONS) {
    candidates.push({
      label: `pooler ${r} (port 5432)`,
      url: `postgresql://postgres.${ref}:${pwd}@${r}.pooler.supabase.com:5432/postgres`,
    });
  }
  for (const r of REGIONS.slice(0, 5)) {
    candidates.push({
      label: `pooler ${r} (port 6543, transaction mode)`,
      url: `postgresql://postgres.${ref}:${pwd}@${r}.pooler.supabase.com:6543/postgres`,
    });
  }
  candidates.push({ label: `direct db.${ref}.supabase.co`, url: `postgresql://postgres:${pwd}@db.${ref}.supabase.co:5432/postgres` });
}

async function tryConnect(url, label) {
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 60000,
  });
  await client.connect();
  console.log(`   ✓ connected via ${label}`);
  return client;
}

async function viaManagementApi() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token || !ref) return false;
  console.log('   → trying Supabase Management API…');
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: schemaSql }),
  });
  if (!r.ok) {
    console.log(`   ✗ management API failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return false;
  }
  console.log('   ✓ connected via Supabase Management API');
  return true;
}

async function seed(client) {
  const bcrypt = (await import('bcryptjs')).default;
  const hash = await bcrypt.hash('demo1234', 10);
  const { rows } = await client.query(
    `insert into public.profiles (email, password_hash, full_name, language, district, land_size_acres)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (email) do update set full_name = excluded.full_name
     returning id`,
    ['demo@farmiq.app', hash, 'Ravi Kumar', 'en', 'Krishna, Andhra Pradesh', 4.5],
  );
  const uid = rows[0].id;

  const existing = await client.query('select count(*)::int as c from public.items where user_id = $1', [uid]);
  if (existing.rows[0].c > 0) {
    console.log('   • demo records already present — skipping sample data');
    return;
  }

  const samples = [
    ['Paddy — Field A', 'Transplanted BPT 5204 on 20 June. Applied 1st urea split. Water level kept at 3 cm.', 'crop', 'growing', 'Paddy', 'Field A', 2, '2026-06-20', 4800],
    ['Soil test — Field A', 'pH 7.4, EC 0.3, N 240, P 14, K 130, organic carbon 0.42%. Nitrogen and phosphorus are low.', 'soil', 'solved', null, 'Field A', 2, null, 0],
    ['Stem borer in paddy', 'Dead hearts seen in patches near the northern bund. Planning neem oil spray first.', 'pest', 'at_risk', 'Paddy', 'Field A', 0.5, null, 0],
    ['Drip irrigation repair', 'Replaced 12 clogged emitters on the chilli block. Filters cleaned.', 'irrigation', 'solved', 'Chilli', 'Field B', 1.5, null, 0],
    ['Groundnut — Field C', 'Sown by dibbling after 40 mm rain. Added gypsum 100 kg at flowering.', 'crop', 'growing', 'Groundnut', 'Field C', 1, '2026-07-05', 1200],
  ];
  for (const s of samples) {
    await client.query(
      `insert into public.items (user_id,title,description,category,status,crop_name,field_name,area_acres,sowing_date,expected_yield_kg)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [uid, ...s],
    );
  }
  console.log('   • demo account + 5 sample records created');
  console.log('     login:  demo@farmiq.app  /  demo1234');
}

(async () => {
  console.log('\n🌱 FARM-IQ — automatic database setup\n');

  if (!candidates.length) {
    if (await viaManagementApi()) {
      console.log('\n✓ Schema applied to your Supabase project via the Management API.');
      console.log('  Tables, indexes, triggers and RLS policies are live. Nothing for you to do.\n');
      if (SEED) console.log('  (sample data needs a direct Postgres connection — set SUPABASE_DB_URL)');
      process.exit(0);
    }
    console.error(
      '\n✗ Nothing to connect with.\n' +
        '  Paste SUPABASE_DB_PASSWORD (Supabase → Project Settings → Database → Connection string → password),\n' +
        '  or a full SUPABASE_DB_URL, or a SUPABASE_ACCESS_TOKEN (sbp_…) into server/.env,\n' +
        '  then run again:  npm run db:setup\n',
    );
    process.exit(1);
  }

  let client = null;
  for (const c of candidates) {
    try {
      client = await tryConnect(c.url, c.label);
      break;
    } catch (e) {
      // keep quiet unless it is the last one; these are cheap probe failures
    }
  }
  if (!client && (await viaManagementApi())) {
    console.log('\n✓ Schema applied through the Management API. Done.\n');
    if (SEED) console.log('  (seeding needs a direct Postgres connection — run again with SUPABASE_DB_URL set)');
    process.exit(0);
  }
  if (!client) {
    console.error(
      '\n✗ Could not reach the database. Fixes to try:\n' +
        '  1. Check SUPABASE_DB_PASSWORD is the DATABASE password (not the API key).\n' +
        '  2. Or paste the full connection string into SUPABASE_DB_URL in server/.env\n' +
        '  3. Or run server/db/schema.sql once in Supabase → SQL Editor.\n',
    );
    process.exit(1);
  }

  try {
    console.log('   → applying schema.sql…');
    await client.query(schemaSql);
    const tables = await client.query(
      `select tablename from pg_tables where schemaname='public' order by tablename`,
    );
    const rls = await client.query(
      `select relname, relrowsecurity from pg_class where relname in ('profiles','items','soil_tests','ai_messages') and relkind='r'`,
    );
    const pol = await client.query(
      `select count(*)::int as c from pg_policies where schemaname='public'`,
    );
    console.log(`   ✓ tables: ${tables.rows.map((r) => r.tablename).join(', ')}`);
    console.log(`   ✓ RLS enabled on: ${rls.rows.filter((r) => r.relrowsecurity).map((r) => r.relname).join(', ')}`);
    console.log(`   ✓ policies created: ${pol.rows[0].c}`);
    if (SEED) await seed(client);
    console.log('\n✓ Database ready. Tables, indexes, triggers and RLS are live.\n');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('\n✗ Setup failed:', e.message, '\n');
  process.exit(1);
});
