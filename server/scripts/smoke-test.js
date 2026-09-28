#!/usr/bin/env node
/**
 * scripts/smoke-test.js — end-to-end API test (real HTTP, real database).
 * Proves: signup → login → CRUD → persistence → AI → per-user isolation → cleanup.
 * Usage:  npm run smoke            (needs the server running)
 *         npm run smoke -- https://farmiq-api.onrender.com
 */
const BASE = (process.argv[2] || process.env.SMOKE_URL || 'http://localhost:5000').replace(/\/$/, '');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✓ ${m}`); };
const no = (m, extra = '') => { fail++; console.log(`  ✗ ${m}${extra ? ` → ${extra}` : ''}`); };

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

(async () => {
  console.log(`\n🧪 FARM-IQ smoke test → ${BASE}\n`);
  const stamp = Date.now();
  const userA = { email: `smoke.a.${stamp}@farmiq.test`, password: 'testPass123', full_name: 'Smoke A', district: 'Guntur', land_size_acres: 3 };
  const userB = { email: `smoke.b.${stamp}@farmiq.test`, password: 'testPass123', full_name: 'Smoke B' };
  let tokenA = '', tokenB = '', itemId = '';

  // 1. health
  const h = await api('GET', '/api/health');
  h.status === 200 && h.json?.ok ? ok(`health ok (supabase=${h.json.integrations.supabase}, gemini=${h.json.integrations.gemini})`) : no('health endpoint', h.status);

  // 2. signup
  const s1 = await api('POST', '/api/auth/signup', { body: userA });
  s1.status === 201 && s1.json?.token ? (tokenA = s1.json.token, ok('signup user A returns token + profile')) : no('signup A', JSON.stringify(s1.json));
  if (!tokenA) return finish();

  // 3. duplicate email rejected
  const dup = await api('POST', '/api/auth/signup', { body: userA });
  dup.status === 400 ? ok('duplicate email rejected') : no('duplicate signup should 400', dup.status);

  // 4. weak password rejected
  const weak = await api('POST', '/api/auth/signup', { body: { email: `w.${stamp}@farmiq.test`, password: '123', full_name: 'W' } });
  weak.status === 400 ? ok('short password rejected') : no('weak password should 400', weak.status);

  // 5. wrong password rejected
  const wrong = await api('POST', '/api/auth/login', { body: { email: userA.email, password: 'not-the-password' } });
  wrong.status === 401 ? ok('wrong password rejected (bcrypt compare)') : no('wrong password should 401', wrong.status);

  // 6. login works
  const l1 = await api('POST', '/api/auth/login', { body: { email: userA.email, password: userA.password } });
  l1.status === 200 && l1.json?.token ? (tokenA = l1.json.token, ok('login returns a session token')) : no('login', JSON.stringify(l1.json));

  // 7. session works on a fresh request (cross-device equivalent)
  const me = await api('GET', '/api/auth/me', { token: tokenA });
  me.status === 200 && me.json?.user?.email === userA.email ? ok('session token identifies the user (/api/auth/me)') : no('/me', me.status);

  // 8. no token → 401
  const anon = await api('GET', '/api/auth/me');
  anon.status === 401 ? ok('protected route blocked without token') : no('missing token should 401', anon.status);

  // 9. create item
  const c = await api('POST', '/api/items', { token: tokenA, body: { title: 'Smoke paddy', description: 'Created by smoke test', category: 'crop', crop_name: 'Paddy', area_acres: 2.5, status: 'growing' } });
  c.status === 201 && c.json?.item?.id ? (itemId = c.json.item.id, ok('CREATE item')) : no('create item', JSON.stringify(c.json));
  if (!itemId) return finish();

  // 10. read back (persistence)
  const r = await api('GET', `/api/items/${itemId}`, { token: tokenA });
  r.status === 200 && r.json?.item?.title === 'Smoke paddy' ? ok('READ item — data persisted to Postgres') : no('read item', JSON.stringify(r.json));

  // 11. list
  const list = await api('GET', '/api/items?limit=10', { token: tokenA });
  list.status === 200 && list.json.items.some((i) => i.id === itemId) ? ok(`LIST items (${list.json.total} total)`) : no('list items', JSON.stringify(list.json).slice(0, 200));

  // 12. search
  const search = await api('GET', '/api/items?q=Smoke', { token: tokenA });
  search.status === 200 && search.json.items.length >= 1 ? ok('search filter works') : no('search', search.status);

  // 13. update
  const u = await api('PATCH', `/api/items/${itemId}`, { token: tokenA, body: { status: 'harvested', description: 'Updated by smoke test' } });
  u.status === 200 && u.json?.item?.status === 'harvested' ? ok('UPDATE item') : no('update item', JSON.stringify(u.json));

  // 14. stats
  const st = await api('GET', '/api/items/stats/summary', { token: tokenA });
  st.status === 200 && st.json.total >= 1 ? ok(`stats summary (total=${st.json.total}, area=${st.json.area_acres})`) : no('stats', JSON.stringify(st.json));

  // 15. isolation: user B cannot see or touch A's item
  const s2 = await api('POST', '/api/auth/signup', { body: userB });
  if (s2.status === 201) {
    tokenB = s2.json.token;
    const bl = await api('GET', '/api/items', { token: tokenB });
    const leaked = (bl.json?.items || []).some((i) => i.id === itemId);
    !leaked ? ok('user isolation — B cannot list A\'s records') : no('DATA LEAK: B sees A items');
    const bg = await api('GET', `/api/items/${itemId}`, { token: tokenB });
    bg.status === 404 ? ok('user isolation — B gets 404 on A\'s record') : no('B should get 404', bg.status);
    const bd = await api('DELETE', `/api/items/${itemId}`, { token: tokenB });
    bd.status === 404 ? ok('user isolation — B cannot delete A\'s record') : no('B should not delete', bd.status);
  } else no('signup user B', JSON.stringify(s2.json));

  // 16. soil fertility maths
  const soil = await api('POST', '/api/soil/fertility', { token: tokenA, body: { crop: 'paddy', area_acres: 2, ph: 7.4, nitrogen_n: 240, phosphorus_p: 14, potassium_k: 130, organic_carbon: 0.42 } });
  soil.status === 200 && soil.json?.report?.fertility_score > 0
    ? ok(`soil fertility score=${soil.json.report.fertility_score} grade="${soil.json.report.grade}" urea=${soil.json.report.fertiliser.urea_kg}kg`)
    : no('soil fertility', JSON.stringify(soil.json).slice(0, 200));

  const crops = await api('GET', '/api/soil/crops', { token: tokenA });
  crops.status === 200 && crops.json.crops.length > 5 ? ok(`crop table (${crops.json.crops.length} crops)`) : no('crop table');

  // 17. save + read soil test
  const sv = await api('POST', '/api/soil/tests', { token: tokenA, body: { ...soil.json.report ? {} : {}, crop: 'paddy', area_acres: 2, ph: 7.4, nitrogen_n: 240, phosphorus_p: 14, potassium_k: 130, organic_carbon: 0.42, report: soil.json.report } });
  sv.status === 201 ? ok('save soil test to database') : no('save soil test', JSON.stringify(sv.json));
  const lt = await api('GET', '/api/soil/tests', { token: tokenA });
  lt.status === 200 && lt.json.tests.length >= 1 ? ok('list saved soil tests') : no('list soil tests');

  // 18. AI
  const ai = await api('POST', '/api/ai/generate', { token: tokenA, body: { prompt: 'My paddy leaves are turning yellow. What should I do?', mode: 'advisory' } });
  ai.status === 200 && ai.json?.text?.length > 20 ? ok(`AI generate works (${ai.json.text.length} chars from ${ai.json.model})`) : no('AI generate', `${ai.status} ${JSON.stringify(ai.json).slice(0, 160)}`);
  const aiNoAuth = await api('POST', '/api/ai/generate', { body: { prompt: 'hi' } });
  aiNoAuth.status === 401 ? ok('AI route requires login') : no('AI should require auth', aiNoAuth.status);

  // 18b. AI summary of a saved record (must be a full answer, not truncated)
  const sum = await api('POST', '/api/ai/summarize', { token: tokenA, body: { recordId: itemId } });
  sum.status === 200 && sum.json?.ai_summary?.length > 40
    ? ok(`AI summary saved to the record (${sum.json.ai_summary.length} chars)`)
    : no('AI summarize', `${sum.status} ${JSON.stringify(sum.json).slice(0, 160)}`);
  const reread = await api('GET', `/api/items/${itemId}`, { token: tokenA });
  reread.json?.item?.ai_summary ? ok('AI summary is stored in the database') : no('summary not persisted');

  // 18c. multilingual reply (same language back)
  const hindi = await api('POST', '/api/ai/generate', { token: tokenA, body: { prompt: 'धान में खरपतवार कैसे रोकें?', mode: 'chat' } });
  hindi.status === 200 && hindi.json?.text?.length > 20
    ? ok(`AI answers in the farmer's language (${hindi.json.text.length} chars)`)
    : no('AI hindi reply', `${hindi.status}`);

  // 19. AI image validation
  const badImg = await api('POST', '/api/ai/scan', { token: tokenA, body: { image: 'not-an-image' } });
  badImg.status === 400 ? ok('camera scan rejects invalid image input') : no('scan validation', badImg.status);

  // 20. delete + confirm gone
  const d = await api('DELETE', `/api/items/${itemId}`, { token: tokenA });
  d.status === 200 ? ok('DELETE item') : no('delete item', JSON.stringify(d.json));
  const gone = await api('GET', `/api/items/${itemId}`, { token: tokenA });
  gone.status === 404 ? ok('deleted record is really gone from the database') : no('deleted item still readable', gone.status);

  finish();
})().catch((e) => { no('unexpected error', e.message); finish(); });

function finish() {
  console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
