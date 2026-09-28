/**
 * lib/api.js — the ONLY place the frontend talks to the server.
 * No API keys here. Just a public base URL + the user's own session token.
 */
const RAW = import.meta.env.VITE_API_BASE_URL?.trim();

// '' means "same origin" (Vercel rewrite / Vite dev proxy handles /api)
export const API_BASE = RAW ? RAW.replace(/\/$/, '') : import.meta.env.DEV ? '' : '';

const TOKEN_KEY = 'farmiq.token';
export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} },
};

export class ApiError extends Error {
  constructor(message, status, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

async function request(method, path, { body, auth = true, timeout = 45000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new ApiError('The server took too long to answer. Please try again.', 408);
    throw new ApiError('Cannot reach the server. Check your internet connection.', 0);
  }
  clearTimeout(timer);

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('farmiq:unauthorized'));
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.field);
  }
  return data;
}

export const api = {
  get: (p, o) => request('GET', p, o),
  post: (p, body, o) => request('POST', p, { ...o, body }),
  patch: (p, body, o) => request('PATCH', p, { ...o, body }),
  del: (p, o) => request('DELETE', p, o),

  // ── auth ──
  signup: (payload) => request('POST', '/auth/signup', { body: payload, auth: false }),
  login: (payload) => request('POST', '/auth/login', { body: payload, auth: false }),
  me: () => request('GET', '/auth/me'),
  updateMe: (payload) => request('PATCH', '/auth/me', { body: payload }),
  logout: () => request('POST', '/auth/logout'),

  // ── items (CRUD) ──
  listItems: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null),
    ).toString();
    return request('GET', `/items${q ? `?${q}` : ''}`);
  },
  createItem: (payload) => request('POST', '/items', { body: payload }),
  getItem: (id) => request('GET', `/items/${id}`),
  updateItem: (id, payload) => request('PATCH', `/items/${id}`, { body: payload }),
  deleteItem: (id) => request('DELETE', `/items/${id}`),
  itemStats: () => request('GET', '/items/stats/summary'),

  // ── ai (always through our backend) ──
  aiGenerate: (payload) => request('POST', '/ai/generate', { body: payload, timeout: 90000 }),
  aiScan: (image) => request('POST', '/ai/scan', { body: { image }, timeout: 90000 }),
  aiSummarize: (recordId) => request('POST', '/ai/summarize', { body: { recordId }, timeout: 90000 }),

  // ── soil ──
  soilCrops: () => request('GET', '/soil/crops', { auth: false }),
  soilFertility: (payload) => request('POST', '/soil/fertility', { body: payload }),
  soilTests: () => request('GET', '/soil/tests'),
  saveSoilTest: (payload) => request('POST', '/soil/tests', { body: payload }),
  deleteSoilTest: (id) => request('DELETE', `/soil/tests/${id}`),
  soilPlan: (testId, note) => request('POST', '/soil/plan', { body: { testId, note }, timeout: 90000 }),

  health: () => request('GET', '/health', { auth: false, timeout: 12000 }),
};
