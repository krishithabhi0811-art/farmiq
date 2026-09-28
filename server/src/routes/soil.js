/**
 * routes/soil.js — soil fertility engine.
 *   GET  /api/soil/crops                 crop nutrient requirement table
 *   POST /api/soil/fertility             NPK + pH + organic-matter scoring & dose plan
 *   POST /api/soil/plan  { scanId }      AI worded plan for a saved soil test
 *   GET  /api/soil/tests                 saved soil tests
 *   POST /api/soil/tests                 save a test
 *   DELETE /api/soil/tests/:id           delete a test
 */
import { Router } from 'express';
import { generateText } from '../lib/gemini.js';
import { env } from '../config/env.js';
import { supabaseAdmin, unwrap } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { assert, cleanString, wrap } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

/** Nutrient need per acre (kg) — N : P2O5 : K2O for a normal season. */
export const CROPS = {
  paddy: { label: 'Paddy / Rice', n: 48, p: 24, k: 24, ph: [5.5, 7.0], note: 'Split nitrogen into 3 doses. Keep field flooded at tillering.' },
  wheat: { label: 'Wheat', n: 48, p: 24, k: 16, ph: [6.0, 7.5], note: 'First irrigation at crown root stage (20-25 days).' },
  maize: { label: 'Maize', n: 48, p: 24, k: 24, ph: [5.8, 7.2], note: 'Zinc deficiency is common — add 10 kg zinc sulphate/acre.' },
  cotton: { label: 'Cotton', n: 60, p: 30, k: 30, ph: [6.0, 8.0], note: 'Avoid excess nitrogen — it invites sucking pests.' },
  chilli: { label: 'Chilli', n: 60, p: 30, k: 40, ph: [6.0, 7.0], note: 'Needs steady moisture; calcium spray reduces fruit rot.' },
  groundnut: { label: 'Groundnut', n: 20, p: 40, k: 30, ph: [6.0, 7.5], note: 'Add gypsum 100 kg/acre at flowering for pod filling.' },
  tomato: { label: 'Tomato', n: 48, p: 32, k: 48, ph: [6.0, 7.0], note: 'Stake early; mulching cuts water use by about a third.' },
  sugarcane: { label: 'Sugarcane', n: 100, p: 40, k: 40, ph: [6.0, 7.5], note: 'Heavy feeder — apply in 3 splits with irrigation.' },
  banana: { label: 'Banana', n: 80, p: 40, k: 80, ph: [6.0, 7.5], note: 'Very high potassium demand; de-sucker regularly.' },
  pulses: { label: 'Pulses (Red gram / Bengal gram)', n: 10, p: 20, k: 10, ph: [6.0, 7.5], note: 'Fixes its own nitrogen — keep starter dose small.' },
  vegetables: { label: 'Leafy / Mixed vegetables', n: 32, p: 20, k: 24, ph: [6.0, 7.0], note: 'Harvest often — feed a little, frequently.' },
  other: { label: 'Other crop', n: 40, p: 20, k: 20, ph: [6.0, 7.5], note: 'Get a soil test for a precise plan.' },
};

const BANDS = {
  n: [280, 560],   // kg/ha available N : low < 280 < medium < 560 < high
  p: [10, 25],     // kg/ha available P
  k: [110, 280],   // kg/ha available K
};

/** Rate a soil test and compute the fertiliser plan. Pure function — easy to test. */
export function assessSoil(input) {
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const { crop = 'other', area_acres = 1, ph, organic_carbon, nitrogen_n, phosphorus_p, potassium_k, ec } = input;

  const cropRow = CROPS[crop] || CROPS.other;
  const area = Math.max(0.05, num(area_acres, 1));

  const band = (value, [lo, hi], label) => {
    if (!Number.isFinite(value)) return { level: 'unknown', score: 60, label };
    if (value < lo) return { level: 'low', score: 35, label };
    if (value <= hi) return { level: 'medium', score: 75, label };
    return { level: 'high', score: 95, label };
  };

  const nB = band(num(nitrogen_n, NaN), BANDS.n, 'Nitrogen (N)');
  const pB = band(num(phosphorus_p, NaN), BANDS.p, 'Phosphorus (P)');
  const kB = band(num(potassium_k, NaN), BANDS.k, 'Potassium (K)');
  const ocBand = band(num(organic_carbon, NaN) * 100, [40, 75], 'Organic carbon');

  const phVal = num(ph, 7);
  const [phLo, phHi] = cropRow.ph;
  let phLevel = 'ideal';
  let phScore = 100;
  let phAdvice = 'pH is in the ideal range for this crop.';
  if (phVal < 5.5) {
    phLevel = 'very acidic'; phScore = 25;
    phAdvice = `Very acidic. Apply agricultural lime 200-400 kg/acre before the next crop, then retest.`;
  } else if (phVal < phLo) {
    phLevel = 'acidic'; phScore = 55;
    phAdvice = `Slightly acidic for ${cropRow.label}. Apply lime 100-200 kg/acre, or use lime-treated seed.`;
  } else if (phVal > 8.5) {
    phLevel = 'strongly alkaline'; phScore = 30;
    phAdvice = 'Strongly alkaline. Add gypsum 200 kg/acre plus green manure / compost to improve soil structure.';
  } else if (phVal > phHi) {
    phLevel = 'alkaline'; phScore = 65;
    phAdvice = 'Mildly alkaline. Add compost or green manure; zinc and iron may be short.';
  }

  // Zone-wise organic carbon (<0.4% low, 0.4-0.75% medium, >0.75% high)
  const scores = [nB, pB, kB, ocBand, { score: phScore }];
  const known = [nB, pB, kB, ocBand].filter((b) => b.level !== 'unknown');
  const fertility_score = Math.round(scores.reduce((s, b) => s + b.score, 0) / scores.length);
  const grade =
    fertility_score >= 85 ? 'Very fertile' :
    fertility_score >= 70 ? 'Good' :
    fertility_score >= 55 ? 'Moderate' : 'Needs attention';

  // Recommendation: scale the crop requirement by how low the nutrient is.
  const factor = (level) => (level === 'low' ? 1.25 : level === 'medium' ? 1.0 : level === 'high' ? 0.6 : 1.0);
  const needN = cropRow.n * factor(nB.level) * area;
  const needP = cropRow.p * factor(pB.level) * area;
  const needK = cropRow.k * factor(kB.level) * area;

  // Convert to straight fertilisers (urea 46% N, DAP 46% P2O5, MOP 60% K2O)
  const urea = Math.round((needN / 0.46) * 10) / 10;
  const dap = Math.round((needP / 0.46) * 10) / 10;
  const mop = Math.round((needK / 0.60) * 10) / 10;

  const warnings = [];
  if (Number.isFinite(num(ec, NaN)) && num(ec) > 1) warnings.push(`EC ${num(ec)} dS/m is high — salt build-up. Flush with good water and add organic matter; avoid fresh manure.`);
  if (phLevel === 'very acidic' || phLevel === 'strongly alkaline') warnings.push('Fix pH first — fertiliser will not work well until pH is corrected.');
  if (nB.level === 'high' && pB.level === 'low') warnings.push('Too much nitrogen with low phosphorus causes leafy plants with weak roots. Skip a urea dose and add DAP / rock phosphate.');

  const actions = [];
  if (nB.level !== 'high') actions.push(`Apply ${urea} kg urea per plot (${Math.round((urea / 3) * 10) / 10} kg per split, 3 splits).`);
  if (pB.level !== 'high') actions.push(`Apply ${dap} kg DAP at sowing, place it 5 cm away from the seed.`);
  if (kB.level !== 'high') actions.push(`Apply ${mop} kg MOP at flowering / 30 and 60 days.`);
  actions.push('Add 2-4 tonnes of farmyard manure or compost per acre every season — it improves all four soil values.');
  actions.push(cropRow.note);
  if (ocBand.level === 'low') actions.push('Grow a green manure (sunhemp / dhaincha) or keep crop residue on the field to raise organic carbon.');

  return {
    crop, crop_label: cropRow.label, area_acres: area,
    fertility_score, grade,
    ph: phVal, ph_level: phLevel, ph_advice: phAdvice,
    nutrients: {
      nitrogen: { ...nB, value: Number.isFinite(num(nitrogen_n, NaN)) ? num(nitrogen_n) : null, unit: 'kg/ha' },
      phosphorus: { ...pB, value: Number.isFinite(num(phosphorus_p, NaN)) ? num(phosphorus_p) : null, unit: 'kg/ha' },
      potassium: { ...kB, value: Number.isFinite(num(potassium_k, NaN)) ? num(potassium_k) : null, unit: 'kg/ha' },
      organic_carbon: { ...ocBand, value: Number.isFinite(num(organic_carbon, NaN)) ? num(organic_carbon) : null, unit: '%' },
    },
    needs: { n: Math.round(needN), p: Math.round(needP), k: Math.round(needK) },
    fertiliser: { urea_kg: urea, dap_kg: dap, mop_kg: mop },
    actions, warnings,
    organic_first: [
      'Vermicompost or FYM 2-4 t/acre — cheapest way to fix most deficiencies.',
      'Panchagavya / jeevamrutham spray every 15 days improves soil life.',
      'Neem cake 100 kg/acre also controls soil pests while feeding the crop.',
    ],
  };
}

router.get('/crops', (req, res) => {
  res.json({
    crops: Object.entries(CROPS).map(([key, v]) => ({
      key, label: v.label, n: v.n, p: v.p, k: v.k, ideal_ph: v.ph, note: v.note,
    })),
  });
});

router.post(
  '/fertility',
  wrap(async (req, res) => {
    const report = assessSoil({
      crop: CROPS[req.body?.crop] ? req.body.crop : 'other',
      area_acres: req.body?.area_acres,
      ph: req.body?.ph,
      organic_carbon: req.body?.organic_carbon,
      nitrogen_n: req.body?.nitrogen_n,
      phosphorus_p: req.body?.phosphorus_p,
      potassium_k: req.body?.potassium_k,
      ec: req.body?.ec,
    });
    res.json({ report });
  }),
);

// ── saved soil tests ─────────────────────────────────────────
const testPayload = (body) => ({
  crop: CROPS[body?.crop] ? body.crop : 'other',
  field_name: cleanString(body?.field_name, 120),
  area_acres: Number(body?.area_acres) || 1,
  ph: Number(body?.ph) || 7,
  organic_carbon: Number(body?.organic_carbon) || 0,
  nitrogen_n: Number(body?.nitrogen_n) || 0,
  phosphorus_p: Number(body?.phosphorus_p) || 0,
  potassium_k: Number(body?.potassium_k) || 0,
  ec: Number(body?.ec) || 0,
  report: body?.report && typeof body.report === 'object' ? body.report : {},
});

router.get(
  '/tests',
  wrap(async (req, res) => {
    const tests = await unwrap(
      supabaseAdmin.from('soil_tests').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(60),
      'soil tests',
    );
    res.json({ tests: tests || [] });
  }),
);

router.post(
  '/tests',
  wrap(async (req, res) => {
    const payload = testPayload(req.body);
    assert(payload.area_acres > 0, 'Area must be more than 0 acres.', 'area_acres');
    const test = await unwrap(
      supabaseAdmin.from('soil_tests').insert({ ...payload, user_id: req.user.id }).select('*').single(),
      'save soil test',
    );
    res.status(201).json({ test });
  }),
);

router.delete(
  '/tests/:id',
  wrap(async (req, res) => {
    const deleted = await unwrap(
      supabaseAdmin.from('soil_tests').delete().eq('id', req.params.id).eq('user_id', req.user.id).select('id').maybeSingle(),
      'delete soil test',
    );
    if (!deleted) return res.status(404).json({ error: 'Soil test not found.' });
    res.json({ ok: true, id: deleted.id });
  }),
);

router.post(
  '/plan',
  wrap(async (req, res) => {
    assert(env.GEMINI_API_KEY, 'AI is not configured on the server yet. Add GEMINI_API_KEY.', 'server');
    const t = await unwrap(
      supabaseAdmin.from('soil_tests').select('*').eq('id', String(req.body?.testId || '')).eq('user_id', req.user.id).maybeSingle(),
      'plan test',
    );
    assert(t, 'Soil test not found.', 'testId');

    const report = t.report && Object.keys(t.report).length ? t.report : assessSoil(t);
    const plan = await generateText(
      `My soil test for ${report.crop_label || t.crop} (${report.area_acres || t.area_acres} acres): ` +
        `pH ${t.ph}, EC ${t.ec}, N ${t.nitrogen_n} kg/ha, P ${t.phosphorus_p} kg/ha, K ${t.potassium_k} kg/ha, ` +
        `organic carbon ${t.organic_carbon}%. Fertility grade: ${report.grade || 'n/a'} ` +
        `(score ${report.fertility_score ?? 'n/a'}/100).\n` +
        `Make me a simple 1-season action plan: what to add, how much per acre, and when. ` +
        `Note: ${cleanString(req.body?.note, 300) || 'none'}`,
      {
        system:
          'You are FARM-IQ, a practical soil advisor for Indian small farmers. Use very simple words, ' +
          'short bullets, local units, and a low-cost-first plan. Keep under 200 words. Reply in the ' +
          "language of the farmer's note. No # headings, no tables.",
        temperature: 0.6,
        maxTokens: 800,
      },
    );
    await unwrap(supabaseAdmin.from('soil_tests').update({ ai_plan: plan }).eq('id', t.id).eq('user_id', req.user.id), 'save plan');
    res.json({ plan, text: plan });
  }),
);

export default router;
