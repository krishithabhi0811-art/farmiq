/**
 * routes/ai.js — Google Gemini, PROXY ONLY (the key never leaves the server).
 *   POST /api/ai/generate   { prompt | messages, mode, image?, recordId? }
 *   POST /api/ai/scan       { image }  → crop/leaf diagnosis
 *   POST /api/ai/summarize  { recordId }
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { generate, generateWithImage } from '../lib/gemini.js';
import { env } from '../config/env.js';
import { supabaseAdmin, unwrap } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { assert, cleanString, wrap } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many AI requests. Please wait a minute.' },
  }),
);

const FARMER_SYSTEM = `You are FARM-IQ, a warm, practical farming advisor for small farmers in India.
Rules:
- Use simple, everyday words a farmer can understand. Short sentences.
- Prefer steps, numbers and local units (acres, quintals, litres, rupee).
- Be specific about crops, pests, doses, timings and seasons.
- If you are unsure, say what to check and suggest asking the local Krishi Vigyan Kendra / agriculture officer.
- Never invent pesticide brands or unsafe chemical doses. Prefer safe, low-cost, organic options first.
- Reply in the same language the farmer used. If they write in Telugu, reply in Telugu. Hindi -> Hindi. English -> English.
- Keep answers under 220 words unless asked for more. Use bullet points with the character. No markdown tables, no # headings.`;

const modeHint = (mode) => ({
  chat: 'Answer the farmer\'s question directly and simply.',
  advisory: 'Give a short action plan: what to do today, this week, and what to watch for.',
  summarize: 'Summarise the details into a crisp 3-bullet summary plus one next action.',
  fertilizer: 'Give a nutrient plan with quantity per acre and timing, plus organic alternatives.',
  pest: 'Identify the likely pest or disease, then give: symptoms to confirm, immediate low-cost action, and prevention.',
  market: 'Give selling advice: best time to sell, storage tips, and how to find a better price. Do not invent today\'s prices.',
  calendar: 'Give a season-wise crop calendar with sowing, irrigation and harvest timing.',
}[mode] || 'Answer the farmer\'s question directly and simply.');

/* ─────────────── POST /api/ai/generate ─────────────── */
router.post(
  '/generate',
  wrap(async (req, res) => {
    assert(env.GEMINI_API_KEY, 'AI is not configured on the server yet. Add GEMINI_API_KEY.', 'server');

    const mode = typeof req.body?.mode === 'string' && req.body.mode ? req.body.mode : 'chat';
    const image = req.body?.image ? String(req.body.image) : null;
    assert(!image || image.length <= 4_000_000, 'Image is too large. Please retake a smaller photo.', 'image');
    assert(!image || image.startsWith('data:image/'), 'Unsupported image format.', 'image');

    const prompt = cleanString(req.body?.prompt, 4000);
    const history = Array.isArray(req.body?.messages) ? req.body.messages.slice(-10) : [];

    // Build alternating turns (Gemini expects user / model / user / model…)
    const contents = [];
    for (const m of history) {
      const text = cleanString(m?.content ?? m?.text, 4000);
      if (!text) continue;
      const role = m?.role === 'assistant' || m?.role === 'model' ? 'model' : 'user';
      const last = contents[contents.length - 1];
      if (last && last.role === role) last.parts.push({ text });
      else contents.push({ role, parts: [{ text }] });
    }
    if (contents.length && contents[0].role === 'model') contents.shift();

    // Context from a saved record, if the farmer attached one
    let recordContext = '';
    if (req.body?.recordId) {
      const rec = await unwrap(
        supabaseAdmin.from('items').select('*').eq('id', String(req.body.recordId)).eq('user_id', req.user.id).maybeSingle(),
        'ai record',
      ).catch(() => null);
      if (rec) {
        recordContext =
          `\n\nFarmer's saved record — Title: ${rec.title}. Crop: ${rec.crop_name || 'n/a'}. ` +
          `Category: ${rec.category}. Status: ${rec.status}. Area: ${rec.area_acres || 0} acres. ` +
          `Sown: ${rec.sowing_date || 'n/a'}. Notes: ${rec.description || 'none'}.`;
      }
    }

    const askText = prompt || 'Please help me with my farm.';
    const userParts = [{ text: `${modeHint(mode)}${recordContext}\n\nFarmer says: ${askText}` }];

    if (image) {
      const { dataUrlToPart } = await import('../lib/gemini.js');
      const part = dataUrlToPart(image);
      assert(part, 'Unsupported image format.', 'image');
      userParts.push(part);
    }

    if (contents.length && contents[contents.length - 1].role === 'user') {
      // merge with the trailing user turn instead of repeating the role
      contents[contents.length - 1].parts.push(...userParts);
    } else {
      contents.push({ role: 'user', parts: userParts });
    }

    const { text, model } = await generate({
      contents,
      system: FARMER_SYSTEM,
      temperature: 0.75,
      maxTokens: 1200,
    });

    res.json({ text, mode, model });
  }),
);

/* ─────────────── POST /api/ai/scan ─────────────── */
router.post(
  '/scan',
  wrap(async (req, res) => {
    assert(env.GEMINI_API_KEY, 'AI is not configured on the server yet. Add GEMINI_API_KEY.', 'server');
    const image = String(req.body?.image || '');
    assert(image.startsWith('data:image/'), 'Please take a photo first.', 'image');
    assert(image.length <= 4_000_000, 'Photo is too large. Please move closer and retake.', 'image');

    const text = await generateWithImage(
      `Look carefully at this crop photo and answer as 5 short bullets:
- What I see (crop and plant part)
- Likely problem (disease / pest / nutrient deficiency / healthy)
- How sure you are (high / medium / low)
- What to do in the next 48 hours, cheapest safe option first
- How to stop it spreading
Use the bullet character. Simple words.`,
      image,
      { system: FARMER_SYSTEM, temperature: 0.5, maxTokens: 900 },
    );

    res.json({ text, model: env.GEMINI_MODEL });
  }),
);

/* ─────────────── POST /api/ai/summarize ─────────────── */
router.post(
  '/summarize',
  wrap(async (req, res) => {
    assert(env.GEMINI_API_KEY, 'AI is not configured on the server yet. Add GEMINI_API_KEY.', 'server');
    const id = cleanString(req.body?.recordId, 60);
    assert(id, 'Record id is required.', 'recordId');

    const rec = await unwrap(
      supabaseAdmin.from('items').select('*').eq('id', id).eq('user_id', req.user.id).maybeSingle(),
      'summarize record',
    );
    assert(rec, 'Record not found.', 'recordId');

    const ai_summary = await generate({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                `Summarise this farm record in 3 short bullets, then give one clear next action.\n` +
                `Title: ${rec.title}\n` +
                `Crop: ${rec.crop_name || 'n/a'} | Field: ${rec.field_name || 'n/a'} | Category: ${rec.category} | Status: ${rec.status}\n` +
                `Area: ${rec.area_acres || 0} acres | Sown: ${rec.sowing_date || 'n/a'} | Expected yield: ${rec.expected_yield_kg || 0} kg\n` +
                `Notes: ${rec.description || 'none'}`,
            },
          ],
        },
      ],
      system: FARMER_SYSTEM,
      temperature: 0.4,
      maxTokens: 700,
    }).then((r) => r.text);

    await unwrap(
      supabaseAdmin.from('items').update({ ai_summary }).eq('id', id).eq('user_id', req.user.id),
      'save summary',
    );

    res.json({ ai_summary, text: ai_summary });
  }),
);

export default router;
