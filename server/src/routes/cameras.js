/**
 * routes/cameras.js — FIELD CAMERAS
 *
 * A camera fixed in the field (ESP32-CAM, Raspberry Pi, an old phone running
 * FARM-IQ's camera mode, or any device that can POST) keeps uploading photos.
 * The farmer opens them in the app and can ask the AI what it sees.
 *
 * Device side (no login — the per-camera device key IS the credential):
 *   POST /api/cameras/:id/upload   header x-camera-key: fqcam_…
 *   POST /api/cameras/:id/ping     header x-camera-key: fqcam_…   (connectivity test)
 *
 * Farmer side (normal session token, only ever their own cameras):
 *   GET    /api/cameras
 *   POST   /api/cameras
 *   PATCH  /api/cameras/:id
 *   DELETE /api/cameras/:id
 *   GET    /api/cameras/:id/photos
 *   DELETE /api/cameras/:id/photos/:photoId
 *   POST   /api/cameras/:id/photos/:photoId/analyse
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { supabaseAdmin, unwrap } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { assert, cleanString, wrap } from '../middleware/validate.js';
import { generateWithImage } from '../lib/gemini.js';
import { FARMER_SYSTEM, FIELD_CAMERA_PROMPT } from '../lib/prompts.js';

const router = Router();

/** Old photos are pruned automatically so the database never fills up. */
const MAX_PHOTOS = Math.max(10, Number(process.env.CAMERA_MAX_PHOTOS || 120));
const MAX_IMAGE_CHARS = 4_000_000; // ~3 MB binary
const PHOTO_COLS = 'id, camera_id, image, ai_note, note, battery, captured_at, created_at';

const newDeviceKey = () => `fqcam_${crypto.randomBytes(20).toString('hex')}`;

const deviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40, // one photo every 1.5s from one IP is already generous
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many camera requests. Please slow down.' },
});

/** Never let auto-analysis run away: at most 1 per camera per 20 minutes. */
const lastAnalysis = new Map();
const analysisAllowed = (cameraId) => {
  const t = lastAnalysis.get(cameraId) || 0;
  if (Date.now() - t < 20 * 60 * 1000) return false;
  lastAnalysis.set(cameraId, Date.now());
  return true;
};

/* ────────────────────────── device side ────────────────────────── */

async function authenticateDevice(req) {
  const key = String(req.headers['x-camera-key'] || req.query.key || '').trim();
  if (!key) {
    const e = new Error('Camera key missing. Send header: x-camera-key');
    e.status = 401;
    throw e;
  }

  assert(/^[0-9a-f-]{36}$/i.test(String(req.params.id || '')), 'Camera id is not valid.', 'id');
  const camera = await unwrap(
    supabaseAdmin.from('cameras').select('*').eq('id', req.params.id).maybeSingle(),
    'camera lookup',
  );

  // constant-time compare so the key cannot be guessed byte by byte
  const expected = Buffer.from(camera?.device_key || '', 'utf8');
  const given = Buffer.from(key, 'utf8');
  const matches = expected.length === given.length && expected.length > 0
    && crypto.timingSafeEqual(expected, given);

  if (!camera || !matches) {
    const e = new Error('Camera not found, or the camera key is wrong.');
    e.status = 401;
    throw e;
  }
  assert(camera.is_active, 'This camera is switched off in FARM-IQ.', 'is_active');
  return camera;
}

router.post(
  '/:id/ping',
  deviceLimiter,
  wrap(async (req, res) => {
    const camera = await authenticateDevice(req);
    await supabaseAdmin.from('cameras')
      .update({ last_seen_at: new Date().toISOString(), battery: cleanString(req.body?.battery, 20) || camera.battery })
      .eq('id', camera.id);
    res.json({
      ok: true,
      camera: camera.name,
      field: camera.field_name || null,
      capture_interval_minutes: camera.capture_interval_minutes,
      message: 'Camera key accepted. You can start sending photos.',
    });
  }),
);

router.post(
  '/:id/upload',
  deviceLimiter,
  wrap(async (req, res) => {
    const camera = await authenticateDevice(req);

    const image = String(req.body?.image || '');
    assert(
      /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image),
      'Send the photo as a data URL: data:image/jpeg;base64,…',
      'image',
    );
    assert(image.length <= MAX_IMAGE_CHARS, 'Photo is too large (max ~3 MB). Please send a smaller JPEG.', 'image');

    const capturedAt = req.body?.captured_at && !Number.isNaN(Date.parse(req.body.captured_at))
      ? new Date(req.body.captured_at).toISOString()
      : new Date().toISOString();
    const note = cleanString(req.body?.note, 200);
    const battery = cleanString(req.body?.battery, 20);

    const photo = await unwrap(
      supabaseAdmin.from('camera_photos').insert({
        camera_id: camera.id,
        user_id: camera.user_id,
        image,
        note: note || null,
        battery: battery || null,
        captured_at: capturedAt,
      }).select(PHOTO_COLS).single(),
      'save camera photo',
    );

    await supabaseAdmin.from('cameras').update({
      last_seen_at: new Date().toISOString(),
      last_note: note || null,
      battery: battery || null,
    }).eq('id', camera.id);

    // keep only the newest MAX_PHOTOS photos for this camera
    const stale = await unwrap(
      supabaseAdmin.from('camera_photos').select('id').eq('camera_id', camera.id)
        .order('captured_at', { ascending: false }).range(MAX_PHOTOS, MAX_PHOTOS + 40),
      'prune lookup',
    ).catch(() => []);
    if (stale?.length) {
      await supabaseAdmin.from('camera_photos').delete().in('id', stale.map((s) => s.id));
    }

    // optional automatic AI reading of the field
    let ai_note = null;
    const wantsAnalysis = camera.auto_analyse || req.query.analyse === '1' || req.body?.analyse === true;
    if (wantsAnalysis && analysisAllowed(camera.id)) {
      ai_note = await analysePhoto(camera, photo).catch(() => null);
    }

    res.status(201).json({
      ok: true,
      photo_id: photo.id,
      captured_at: photo.captured_at,
      photos_kept: MAX_PHOTOS,
      analysed: Boolean(ai_note),
      ai_note,
    });
  }),
);

/** Ask the AI what it sees in a field photo and store the reading. */
async function analysePhoto(camera, photo) {
  const text = await generateWithImage(FIELD_CAMERA_PROMPT, photo.image, {
    system: FARMER_SYSTEM,
    temperature: 0.4,
    maxTokens: 1000,
  });
  await supabaseAdmin.from('camera_photos').update({ ai_note: text })
    .eq('id', photo.id).eq('user_id', camera.user_id);
  lastAnalysis.set(camera.id, Date.now());
  return text;
}

/* ────────────────────────── farmer side ────────────────────────── */

router.use(requireAuth);

router.get(
  '/',
  wrap(async (req, res) => {
    const cameras = await unwrap(
      supabaseAdmin.from('cameras').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }),
      'list cameras',
    ) || [];

    const withMeta = await Promise.all(cameras.map(async (c) => {
      const { count } = await supabaseAdmin.from('camera_photos')
        .select('id', { count: 'exact', head: true }).eq('camera_id', c.id);
      const latest = await unwrap(
        supabaseAdmin.from('camera_photos').select('id, captured_at, ai_note')
          .eq('camera_id', c.id).order('captured_at', { ascending: false }).limit(1).maybeSingle(),
        'latest photo',
      ).catch(() => null);
      return { ...c, photo_count: count ?? 0, latest_photo: latest || null };
    }));

    res.json({ cameras: withMeta, keep_limit: MAX_PHOTOS });
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    const name = cleanString(req.body?.name, 80);
    assert(name.length >= 2, 'Give the camera a name, e.g. "North field camera".', 'name');

    const interval = Number(req.body?.capture_interval_minutes);
    const camera = await unwrap(
      supabaseAdmin.from('cameras').insert({
        user_id: req.user.id,
        name,
        field_name: cleanString(req.body?.field_name, 80) || null,
        location_note: cleanString(req.body?.location_note, 200) || null,
        capture_interval_minutes: [5, 15, 30, 60, 180, 360, 720].includes(interval) ? interval : 60,
        auto_analyse: Boolean(req.body?.auto_analyse),
        device_key: newDeviceKey(),
      }).select('*').single(),
      'create camera',
    );

    res.status(201).json({ camera, upload_url: `/api/cameras/${camera.id}/upload` });
  }),
);

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const patch = {};
    if (req.body?.name != null) {
      const name = cleanString(req.body.name, 80);
      assert(name.length >= 2, 'Camera name is too short.', 'name');
      patch.name = name;
    }
    if (req.body?.field_name != null) patch.field_name = cleanString(req.body.field_name, 80) || null;
    if (req.body?.location_note != null) patch.location_note = cleanString(req.body.location_note, 200) || null;
    if (req.body?.capture_interval_minutes != null) {
      const interval = Number(req.body.capture_interval_minutes);
      patch.capture_interval_minutes = [5, 15, 30, 60, 180, 360, 720].includes(interval) ? interval : 60;
    }
    if (req.body?.is_active != null) patch.is_active = Boolean(req.body.is_active);
    if (req.body?.auto_analyse != null) patch.auto_analyse = Boolean(req.body.auto_analyse);
    if (req.body?.rotate_key) patch.device_key = newDeviceKey();
    assert(Object.keys(patch).length > 0, 'Nothing to update.');

    const camera = await unwrap(
      supabaseAdmin.from('cameras').update(patch).eq('id', req.params.id).eq('user_id', req.user.id)
        .select('*').maybeSingle(),
      'update camera',
    );
    if (!camera) return res.status(404).json({ error: 'Camera not found.' });
    res.json({ camera });
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const deleted = await unwrap(
      supabaseAdmin.from('cameras').delete().eq('id', req.params.id).eq('user_id', req.user.id)
        .select('id').maybeSingle(),
      'delete camera',
    );
    if (!deleted) return res.status(404).json({ error: 'Camera not found.' });
    res.json({ ok: true, id: deleted.id });
  }),
);

router.get(
  '/:id/photos',
  wrap(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const camera = await unwrap(
      supabaseAdmin.from('cameras').select('id, name, field_name').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle(),
      'camera',
    );
    if (!camera) return res.status(404).json({ error: 'Camera not found.' });

    const { data, error, count } = await supabaseAdmin.from('camera_photos')
      .select(PHOTO_COLS, { count: 'exact' })
      .eq('camera_id', camera.id)
      .order('captured_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw Object.assign(new Error(error.message), { status: 500 });

    res.json({ camera, photos: data || [], total: count ?? (data || []).length, limit, offset });
  }),
);

router.delete(
  '/:id/photos/:photoId',
  wrap(async (req, res) => {
    const deleted = await unwrap(
      supabaseAdmin.from('camera_photos').delete()
        .eq('id', req.params.photoId).eq('camera_id', req.params.id).eq('user_id', req.user.id)
        .select('id').maybeSingle(),
      'delete photo',
    );
    if (!deleted) return res.status(404).json({ error: 'Photo not found.' });
    res.json({ ok: true, id: deleted.id });
  }),
);

router.post(
  '/:id/photos/:photoId/analyse',
  wrap(async (req, res) => {
    const camera = await unwrap(
      supabaseAdmin.from('cameras').select('*').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle(),
      'camera',
    );
    if (!camera) return res.status(404).json({ error: 'Camera not found.' });

    const photo = await unwrap(
      supabaseAdmin.from('camera_photos').select('*')
        .eq('id', req.params.photoId).eq('camera_id', camera.id).eq('user_id', req.user.id).maybeSingle(),
      'photo',
    );
    if (!photo) return res.status(404).json({ error: 'Photo not found.' });

    const ai_note = await analysePhoto(camera, photo);
    res.json({ ai_note, text: ai_note });
  }),
);

export default router;
