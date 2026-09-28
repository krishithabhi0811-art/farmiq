/**
 * routes/items.js — the farmer's own records (crops / activities).
 * Full CRUD, every row scoped to req.user.id.
 *   GET    /api/items            list (search, filter, paginate)
 *   POST   /api/items            create
 *   GET    /api/items/:id        read one
 *   PATCH  /api/items/:id        update
 *   DELETE /api/items/:id        delete
 *   GET    /api/items/stats/summary
 */
import { Router } from 'express';
import { supabaseAdmin, unwrap } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { assert, cleanString, wrap } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

const CATEGORIES = ['crop', 'soil', 'pest', 'irrigation', 'fertilizer', 'weather', 'expense', 'other'];
const STATUSES = ['planned', 'growing', 'harvested', 'at_risk', 'solved'];

const sanitize = (body, { partial = false } = {}) => {
  const out = {};
  const has = (k) => body?.[k] !== undefined;

  if (has('title') || !partial) {
    out.title = cleanString(body?.title, 160);
    assert(out.title.length >= 2, 'Record title is required.', 'title');
  }
  if (has('description') || !partial) out.description = cleanString(body?.description, 4000);
  if (has('category')) {
    out.category = CATEGORIES.includes(body.category) ? body.category : 'other';
  } else if (!partial) out.category = 'crop';
  if (has('status')) {
    out.status = STATUSES.includes(body.status) ? body.status : 'planned';
  } else if (!partial) out.status = 'planned';
  if (has('crop_name')) out.crop_name = cleanString(body.crop_name, 120);
  if (has('field_name')) out.field_name = cleanString(body.field_name, 120);
  if (has('area_acres')) out.area_acres = Number(body.area_acres) || 0;
  if (has('sowing_date')) out.sowing_date = body.sowing_date ? String(body.sowing_date).slice(0, 10) : null;
  if (has('expected_yield_kg')) out.expected_yield_kg = Number(body.expected_yield_kg) || 0;
  if (has('ai_summary')) out.ai_summary = cleanString(body.ai_summary, 4000);
  if (has('photo')) {
    const photo = String(body.photo || '');
    assert(photo.length <= 900_000, 'Photo is too large. Try a smaller picture.', 'photo');
    out.photo = photo.startsWith('data:image/') ? photo : null;
  }
  return out;
};

router.get(
  '/',
  wrap(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const from = (page - 1) * limit;

    let q = supabaseAdmin
      .from('items')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (req.query.category && CATEGORIES.includes(String(req.query.category))) {
      q = q.eq('category', String(req.query.category));
    }
    if (req.query.status && STATUSES.includes(String(req.query.status))) {
      q = q.eq('status', String(req.query.status));
    }
    const search = cleanString(req.query.q, 80).replace(/[%,()]/g, '');
    if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%,crop_name.ilike.%${search}%`);

    const { data, error, count } = await q;
    if (error) throw Object.assign(new Error(error.message), { status: 500 });
    res.json({ items: data || [], page, limit, total: count ?? (data || []).length });
  }),
);

router.get(
  '/stats/summary',
  wrap(async (req, res) => {
    const data = await unwrap(
      supabaseAdmin.from('items').select('category, status, area_acres, expected_yield_kg').eq('user_id', req.user.id),
      'stats',
    );
    const rows = data || [];
    const byCategory = {};
    const byStatus = {};
    for (const r of rows) {
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    }
    res.json({
      total: rows.length,
      area_acres: rows.reduce((s, r) => s + (Number(r.area_acres) || 0), 0),
      expected_yield_kg: rows.reduce((s, r) => s + (Number(r.expected_yield_kg) || 0), 0),
      at_risk: rows.filter((r) => r.status === 'at_risk').length,
      byCategory,
      byStatus,
    });
  }),
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const item = await unwrap(
      supabaseAdmin.from('items').select('*').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle(),
      'item read',
    );
    if (!item) return res.status(404).json({ error: 'Record not found.' });
    res.json({ item });
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    const payload = sanitize(req.body);
    const item = await unwrap(
      supabaseAdmin.from('items').insert({ ...payload, user_id: req.user.id }).select('*').single(),
      'item create',
    );
    res.status(201).json({ item });
  }),
);

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const payload = sanitize(req.body, { partial: true });
    assert(Object.keys(payload).length > 0, 'Nothing to update.');
    const item = await unwrap(
      supabaseAdmin.from('items').update(payload).eq('id', req.params.id).eq('user_id', req.user.id).select('*').maybeSingle(),
      'item update',
    );
    if (!item) return res.status(404).json({ error: 'Record not found.' });
    res.json({ item });
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const deleted = await unwrap(
      supabaseAdmin.from('items').delete().eq('id', req.params.id).eq('user_id', req.user.id).select('id').maybeSingle(),
      'item delete',
    );
    if (!deleted) return res.status(404).json({ error: 'Record not found.' });
    res.json({ ok: true, id: deleted.id });
  }),
);

export default router;
