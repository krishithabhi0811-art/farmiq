#!/usr/bin/env node
/**
 * scripts/deploy-render.js — creates (or updates) the FARM-IQ backend on Render
 * and prints the service URL. Idempotent: run it again after edits.
 *
 * Usage:  RENDER_API_KEY=rnd_… node scripts/deploy-render.js
 */
const RND = process.env.RENDER_API_KEY;
if (!RND) { console.error('Set RENDER_API_KEY'); process.exit(1); }

const API = 'https://api.render.com/v1';
const REPO = process.env.REPO_URL || 'https://github.com/krishithabhi0811-art/farmiq';
const NAME = process.env.SERVICE_NAME || 'farmiq-api';

const h = { Authorization: `Bearer ${RND}`, 'Content-Type': 'application/json', Accept: 'application/json' };
const req = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!r.ok) { const e = new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 600)}`); e.status = r.status; throw e; }
  return json;
};

(async () => {
  const owners = await req('GET', '/owners?limit=20');
  const ownerId = owners[0]?.owner?.id;
  console.log('owner:', ownerId, `(${owners[0]?.owner?.name})`);

  const envVars = [
    { key: 'NODE_ENV', value: 'production' },
    { key: 'JWT_SECRET', value: process.env.JWT_SECRET },
    { key: 'JWT_EXPIRES_IN', value: '30d' },
    { key: 'SUPABASE_URL', value: process.env.SUPABASE_URL },
    { key: 'SUPABASE_ANON_KEY', value: process.env.SUPABASE_ANON_KEY },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY },
    { key: 'SUPABASE_ACCESS_TOKEN', value: process.env.SUPABASE_ACCESS_TOKEN },
    { key: 'GEMINI_API_KEY', value: process.env.GEMINI_API_KEY },
    { key: 'GEMINI_MODEL', value: process.env.GEMINI_MODEL || 'gemini-3.8-flash' },
    { key: 'CLIENT_URL', value: process.env.CLIENT_URL || 'http://localhost:5173' },
  ].filter((v) => v.value);

  const payload = {
    type: 'web_service',
    name: NAME,
    ownerId,
    repo: REPO,
    branch: process.env.REPO_BRANCH || 'main',
    rootDir: 'server',
    autoDeploy: 'yes',
    envVars,
    serviceDetails: {
      env: 'node',
      plan: 'free',
      region: 'singapore',
      healthCheckPath: '/api/health',
      envSpecificDetails: { buildCommand: 'npm install', startCommand: 'npm start' },
    },
  };

  const existing = await req('GET', '/services?limit=50').catch(() => []);
  const found = Array.isArray(existing) ? existing.find((s) => s?.service?.name === NAME) : null;

  let service;
  if (found) {
    console.log('service exists → updating env vars + build settings');
    service = found.service;
    await req('PUT', `/services/${service.id}`, {
      name: NAME, repo: REPO, branch: payload.branch, rootDir: 'server', autoDeploy: 'yes',
      serviceDetails: payload.serviceDetails,
    });
    for (const v of envVars) await req('PUT', `/services/${service.id}/env-vars/${v.key}`, { value: v.value }).catch(async () =>
      req('POST', `/services/${service.id}/env-vars`, [v]));
  } else {
    console.log('creating service…');
    const created = await req('POST', '/services', payload);
    service = created.service || created;
  }

  console.log('service id  :', service.id);
  console.log('service url :', service.serviceDetails?.url || service.url || '(pending)');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
