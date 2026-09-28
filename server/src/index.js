/**
 * FARM-IQ API server — Express entry point.
 * Secrets stay here. The client only ever calls these routes.
 */
import express from 'express';
import cors from 'cors';
import { env, assertConfig, integrationStatus } from './config/env.js';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import aiRoutes from './routes/ai.js';
import soilRoutes from './routes/soil.js';
import { assessSoil } from './routes/soil.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ── CORS ──────────────────────────────────────────────────────
// Allows localhost dev, the CLIENT_URL(s) from .env, and any *.vercel.app preview.
const allowList = new Set(env.CLIENT_ORIGINS);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl / server-to-server / same-origin
      const clean = origin.replace(/\/$/, '');
      if (
        env.CORS_ALLOW_ANY ||
        env.NODE_ENV !== 'production' ||
        allowList.has(clean) ||
        /^https?:\/\/localhost(:\d+)?$/.test(clean) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(clean) ||
        /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(clean)
      ) {
        return cb(null, true);
      }
      return cb(null, false); // no CORS header → browser blocks it (no 500 error)
    },
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(express.json({ limit: '6mb' })); // 6mb so camera photos fit

app.get('/', (req, res) =>
  res.json({ name: 'FARM-IQ API', status: 'ok', docs: '/api/health', time: new Date().toISOString() }),
);

app.get('/api/health', (req, res) => {
  const status = integrationStatus();
  res.json({
    ok: true,
    service: 'farmiq-api',
    version: '1.0.0',
    env: env.NODE_ENV,
    integrations: status,
    gemini_model: env.GEMINI_MODEL,
    time: new Date().toISOString(),
  });
});

// Public, dependency-free soil maths (useful for quick checks)
app.post('/api/soil/fertility-preview', (req, res) => res.json({ report: assessSoil(req.body || {}) }));

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/soil', soilRoutes);

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` }));

// ── error handler (never leaks secrets) ───────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error('[FARM-IQ error]', err.message);
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong on the server. Please try again.' : err.message,
    field: err.field,
  });
});

const problems = assertConfig();
if (problems.length) console.warn('[FARM-IQ] config warnings:\n  - ' + problems.join('\n  - '));

app.listen(env.PORT, '0.0.0.0', () => {
  const s = integrationStatus();
  console.log(`🌱 FARM-IQ API listening on 0.0.0.0:${env.PORT}  [${env.NODE_ENV}]`);
  console.log(`   supabase=${s.supabase ? 'ok' : 'missing'}  gemini=${s.gemini ? 'ok' : 'missing'}  cors=${env.CLIENT_ORIGINS.join(', ')}`);
});
