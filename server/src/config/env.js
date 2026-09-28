/**
 * config/env.js — single source of truth for server configuration.
 * ALL secrets live here and are read from server/.env ONLY.
 * The frontend never receives any of these values.
 */
import 'dotenv/config';

const bool = (v, d = false) => (v == null ? d : /^(1|true|yes|on)$/i.test(String(v)));

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),

  JWT_SECRET: process.env.JWT_SECRET || 'dev_only_insecure_secret_change_me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',

  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  CLIENT_ORIGINS: String(process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),

  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_DB_URL: process.env.SUPABASE_DB_URL || '',
  SUPABASE_DB_PASSWORD: process.env.SUPABASE_DB_PASSWORD || '',

  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',

  CORS_ALLOW_ANY: bool(process.env.CORS_ALLOW_ANY, false),
};

/** Resolve the Supabase Postgres connection string (for auto table creation). */
export function resolveDbUrl() {
  if (env.SUPABASE_DB_URL) return env.SUPABASE_DB_URL.trim();
  if (env.SUPABASE_URL && env.SUPABASE_DB_PASSWORD) {
    const ref = env.SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0];
    const pwd = encodeURIComponent(env.SUPABASE_DB_PASSWORD);
    // Supavisor pooler (IPv4 friendly) — works from Render/Vercel/sandboxes
    return `postgresql://postgres.${ref}:${pwd}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;
  }
  return '';
}

/** Which integrations are configured, for /api/health. */
export function integrationStatus() {
  return {
    supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    database: Boolean(resolveDbUrl()),
    gemini: Boolean(env.GEMINI_API_KEY),
    jwtSecretChanged: env.JWT_SECRET !== 'dev_only_insecure_secret_change_me',
  };
}

export function assertConfig() {
  const problems = [];
  if (!env.SUPABASE_URL) problems.push('SUPABASE_URL is missing');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) problems.push('SUPABASE_SERVICE_ROLE_KEY is missing');
  if (!env.GEMINI_API_KEY) problems.push('GEMINI_API_KEY is missing (AI features will be off)');
  if (env.NODE_ENV === 'production' && !integrationStatus().jwtSecretChanged) {
    problems.push('JWT_SECRET must be changed in production');
  }
  return problems;
}
