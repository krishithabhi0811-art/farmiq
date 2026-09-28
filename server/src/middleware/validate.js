/** middleware/validate.js — tiny dependency-free body validator. */

export function badRequest(res, message, field) {
  return res.status(400).json({ error: message, field });
}

export const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

export function cleanString(v, max = 5000) {
  if (v == null) return '';
  return String(v).replace(/\u0000/g, '').trim().slice(0, max);
}

export function assert(cond, message, field) {
  if (!cond) {
    const e = new Error(message);
    e.status = 400;
    e.field = field;
    throw e;
  }
}

/** Async route wrapper so thrown errors reach the error handler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
