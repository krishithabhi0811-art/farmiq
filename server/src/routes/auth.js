/**
 * routes/auth.js — email + password auth with bcrypt hashing.
 *   POST /api/auth/signup
 *   POST /api/auth/login
 *   GET  /api/auth/me
 *   PATCH /api/auth/me
 *   POST /api/auth/logout
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { supabaseAdmin, unwrap } from '../lib/supabase.js';
import { signSession, requireAuth } from '../middleware/auth.js';
import { assert, isEmail, cleanString, wrap } from '../middleware/validate.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait 15 minutes.' },
});

const publicProfile = (p) => ({
  id: p.id,
  email: p.email,
  full_name: p.full_name,
  language: p.language,
  district: p.district,
  land_size_acres: p.land_size_acres,
  created_at: p.created_at,
});

router.post(
  '/signup',
  authLimiter,
  wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const full_name = cleanString(req.body?.full_name, 120);
    const language = ['en', 'hi', 'te'].includes(req.body?.language) ? req.body.language : 'en';
    const district = cleanString(req.body?.district, 120);
    const land_size_acres = Number.isFinite(Number(req.body?.land_size_acres))
      ? Math.max(0, Number(req.body.land_size_acres))
      : null;

    assert(isEmail(email), 'Please enter a valid email address.', 'email');
    assert(password.length >= 6, 'Password must be at least 6 characters.', 'password');
    assert(full_name.length >= 2, 'Please enter your name.', 'full_name');

    const existing = await unwrap(
      supabaseAdmin.from('profiles').select('id').eq('email', email).maybeSingle(),
      'signup lookup',
    );
    assert(!existing, 'An account with this email already exists. Please log in.', 'email');

    // bcrypt — password is never stored in plain text
    const password_hash = await bcrypt.hash(password, 10);

    const profile = await unwrap(
      supabaseAdmin
        .from('profiles')
        .insert({ email, password_hash, full_name, language, district, land_size_acres })
        .select('id, email, full_name, language, district, land_size_acres, created_at')
        .single(),
      'signup insert',
    );

    res.status(201).json({ token: signSession(profile), user: publicProfile(profile) });
  }),
);

router.post(
  '/login',
  authLimiter,
  wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    assert(isEmail(email), 'Please enter a valid email address.', 'email');
    assert(password, 'Please enter your password.', 'password');

    const profile = await unwrap(
      supabaseAdmin.from('profiles').select('*').eq('email', email).maybeSingle(),
      'login lookup',
    );

    // Same message either way — don't leak which emails exist.
    const ok = profile ? await bcrypt.compare(password, profile.password_hash || '') : false;
    if (!profile || !ok) {
      return res.status(401).json({ error: 'Wrong email or password.', field: 'password' });
    }

    res.json({ token: signSession(profile), user: publicProfile(profile) });
  }),
);

router.get('/me', requireAuth, (req, res) => res.json({ user: publicProfile(req.user) }));

router.patch(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const patch = {};
    if (req.body?.full_name != null) {
      const full_name = cleanString(req.body.full_name, 120);
      assert(full_name.length >= 2, 'Please enter your name.', 'full_name');
      patch.full_name = full_name;
    }
    if (req.body?.language != null) {
      assert(['en', 'hi', 'te'].includes(req.body.language), 'Unsupported language.', 'language');
      patch.language = req.body.language;
    }
    if (req.body?.district != null) patch.district = cleanString(req.body.district, 120);
    if (req.body?.land_size_acres != null && Number.isFinite(Number(req.body.land_size_acres))) {
      patch.land_size_acres = Math.max(0, Number(req.body.land_size_acres));
    }

    // Password change (optional, still bcrypt)
    if (req.body?.new_password) {
      assert(String(req.body.new_password).length >= 6, 'New password must be at least 6 characters.', 'new_password');
      const cur = await unwrap(supabaseAdmin.from('profiles').select('password_hash').eq('id', req.user.id).single(), 'profile');
      const ok = await bcrypt.compare(String(req.body.current_password || ''), cur.password_hash || '');
      assert(ok, 'Current password is incorrect.', 'current_password');
      patch.password_hash = await bcrypt.hash(String(req.body.new_password), 10);
    }

    assert(Object.keys(patch).length > 0, 'Nothing to update.');

    const updated = await unwrap(
      supabaseAdmin.from('profiles').update(patch).eq('id', req.user.id)
        .select('id, email, full_name, language, district, land_size_acres, created_at').single(),
      'profile update',
    );

    res.json({ user: publicProfile(updated) });
  }),
);

// Sessions are stateless JWTs; the client simply drops the token.
router.post('/logout', (req, res) => res.json({ ok: true }));

export default router;
