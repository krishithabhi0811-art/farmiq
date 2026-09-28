/**
 * middleware/auth.js — verifies the Bearer session token (JWT) issued at login.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../lib/supabase.js';

export function signSession(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, v: 1 },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Please log in to continue.' });

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Your session expired. Please log in again.' });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, language, district, land_size_acres, created_at')
      .eq('id', payload.sub)
      .maybeSingle();

    if (error) return res.status(503).json({ error: 'Database unavailable. Try again shortly.' });
    if (!profile) return res.status(401).json({ error: 'Account not found. Please sign up again.' });

    req.user = profile;
    next();
  } catch (e) {
    next(e);
  }
}
