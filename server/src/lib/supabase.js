/**
 * lib/supabase.js — server-side Supabase clients.
 * The service_role client is used for all DB work (bypasses RLS, so every
 * query is scoped to the logged-in user_id by middleware + route code).
 *
 * Note: we never use Supabase Realtime, but supabase-js still constructs a
 * realtime client — on Node < 22 that needs a WebSocket implementation, so we
 * hand it the `ws` package. If that ever fails we fall back gracefully.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

let wsTransport = null;
try {
  const ws = await import('ws');
  wsTransport = ws.default ?? ws;
} catch {
  wsTransport = null; // Node 22+ has native WebSocket
}

function buildClient(roleKey) {
  const key = roleKey || 'missing';
  const base = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const options = wsTransport ? { ...base, realtime: { transport: wsTransport } } : base;
  try {
    return createClient(env.SUPABASE_URL || 'http://localhost', key, options);
  } catch {
    // last-resort: create without the realtime transport hint
    return createClient(env.SUPABASE_URL || 'http://localhost', key, base);
  }
}

export const supabaseAdmin = buildClient(env.SUPABASE_SERVICE_ROLE_KEY);

/** Anon client — only used by verification scripts to prove RLS blocks strangers. */
export const supabaseAnon = buildClient(env.SUPABASE_ANON_KEY);

/** Wrap a supabase call and turn failures into real Error objects. */
export async function unwrap(promise, label = 'database') {
  const { data, error } = await promise;
  if (error) {
    const err = new Error(`${label}: ${error.message}`);
    err.status = /duplicate|unique/i.test(error.message) ? 409 : 500;
    err.code = error.code;
    err.details = error.details;
    throw err;
  }
  return data;
}
