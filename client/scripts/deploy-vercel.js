#!/usr/bin/env node
/**
 * scripts/deploy-vercel.js — builds the client and ships it to Vercel.
 *
 * This account has no GitHub integration on Vercel, so instead of a git-based
 * build we upload the pre-built static bundle (client/dist) plus a vercel.json
 * that proxies /api/* to the Render backend. Result: same-origin API calls,
 * therefore no CORS issues at all in the browser.
 *
 * Usage:  VERCEL_TOKEN=vcp_… API_URL=https://farmiq-api.onrender.com \
 *         node scripts/deploy-vercel.js
 */
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.VERCEL_TOKEN;
const API = process.env.API_URL;
const PROJECT = process.env.PROJECT_NAME || 'farmiq';
const TEAM = process.env.VERCEL_TEAM || 'team_b4jibq5iELREM0XYZqU0Emrh';
if (!TOKEN || !API) { console.error('Set VERCEL_TOKEN and API_URL'); process.exit(1); }

const DIST = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(DIST)) { console.error('dist/ not found — run: npm run build'); process.exit(1); }

const h = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const api = async (method, url, body) => {
  const res = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
};
const q = (extra = '') => `?teamId=${TEAM}${extra}`;

/** walk dist/ → [{ file, data(base64), encoding }] */
function collect(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...collect(full, rel));
    else out.push({ file: rel, data: fs.readFileSync(full).toString('base64'), encoding: 'base64' });
  }
  return out;
}

(async () => {
  // 1. project (create if missing)
  let project = (await api('GET', `https://api.vercel.com/v9/projects/${PROJECT}${q()}`)).json;
  if (!project || project.error) {
    console.log('creating project', PROJECT, '…');
    const created = await api('POST', `https://api.vercel.com/v11/projects${q()}`, {
      name: PROJECT,
      framework: null,
      publicSource: false,
    });
    if (!created.ok) throw new Error(`project create failed: ${JSON.stringify(created.json).slice(0, 400)}`);
    project = created.json;
  }
  console.log('project:', project.name, project.id);

  // 2. files: the built SPA + a static-deploy vercel.json (API proxy + SPA fallback)
  const vercelJson = {
    rewrites: [
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      { source: '/(.*)', destination: '/index.html' },
    ],
    headers: [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ],
  };
  const files = [
    ...collect(DIST),
    { file: 'vercel.json', data: Buffer.from(JSON.stringify(vercelJson, null, 2)).toString('base64'), encoding: 'base64' },
  ];
  console.log('uploading', files.length, 'files…');

  // 3. deploy to production
  const dep = await api('POST', `https://api.vercel.com/v13/deployments${q('&forceNew=1')}`, {
    name: PROJECT,
    files,
    target: 'production',
    projectSettings: {
      framework: null,
      buildCommand: null,
      outputDirectory: null,
      installCommand: null,
      devCommand: null,
    },
  });
  if (!dep.ok) throw new Error(`deploy failed: ${JSON.stringify(dep.json).slice(0, 600)}`);

  let { url, id, readyState } = dep.json;
  console.log('deployment:', id, url, readyState);

  // 4. wait for READY (max ~3 min)
  for (let i = 0; i < 36 && readyState !== 'READY' && readyState !== 'ERROR'; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await api('GET', `https://api.vercel.com/v13/deployments/${id}${q()}`);
    readyState = s.json?.readyState;
    url = s.json?.url || url;
    process.stdout.write(`\r  state: ${readyState}   `);
  }
  console.log('');
  if (readyState !== 'READY') throw new Error(`deployment ended in state ${readyState}`);

  const aliases = (await api('GET', `https://api.vercel.com/v9/projects/${PROJECT}${q()}`)).json?.alias || [];
  console.log('production url :', `https://${url}`);
  console.log('project domains:', aliases.map((a) => a.domain).join(', ') || '(default domain assigned)');
  console.log('PRODUCTION_URL=https://' + (aliases[0]?.domain || url));
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
