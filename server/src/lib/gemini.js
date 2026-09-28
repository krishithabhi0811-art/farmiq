/**
 * lib/gemini.js — Google Gemini over plain HTTPS (no SDK to go stale).
 *
 * • Key stays on the server, never sent to the browser.
 * • Automatic model fallback: if the primary model is retired or busy (404/503),
 *   the next model in the chain is tried before giving up.
 * • Supports text and inline images (base64 data URLs) for crop photo scans.
 */
import { env } from '../config/env.js';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Ordered fallback chain — the first model that answers wins.
 * Includes "lite" models on purpose: they are far less likely to be busy when
 * the flagship models spike, so farmers basically never see an AI error.
 */
export function modelChain(primary = env.GEMINI_MODEL) {
  return [...new Set([
    primary,
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
  ].filter(Boolean))];
}

/** Transient upstream problems — worth one more pass with a short pause. */
const TRANSIENT = [0, 408, 429, 500, 502, 503, 504];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dataUrlToPart = (dataUrl) => {
  const m = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl));
  if (!m) return null;
  return { inline_data: { mime_type: m[1], data: m[2] } };
};

/**
 * One HTTP call to one model. `noThink` disables the model's internal
 * "thinking" tokens — they are not needed for short farming answers and,
 * if left on, they can swallow the whole output budget (empty replies).
 */
async function callModel(model, { contents, system, temperature, maxTokens, noThink }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);

  const generationConfig = { temperature, maxOutputTokens: maxTokens };
  if (noThink) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const body = {
    contents,
    generationConfig,
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  try {
    const res = await fetch(`${API_ROOT}/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await res.json().catch(() => null);
    const candidate = json?.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((p) => p?.text || '').join('').trim();
    return {
      ok: res.ok,
      status: res.status,
      message: json?.error?.message || `AI request failed (${res.status})`,
      text,
      finishReason: candidate?.finishReason,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      message: err.name === 'AbortError' ? 'The AI took too long to answer. Please try again.' : err.message,
      text: '',
    };
  }
}

/**
 * @param {object}   opts
 * @param {Array}    opts.contents      Gemini contents array (role + parts)
 * @param {string}   [opts.system]      system instruction
 * @param {number}   [opts.temperature]
 * @param {number}   [opts.maxTokens]
 * @returns {Promise<{text:string, model:string}>}
 */
export async function generate({ contents, system, temperature = 0.7, maxTokens = 1600 }) {
  if (!env.GEMINI_API_KEY) {
    const e = new Error('AI is not configured on the server yet.');
    e.status = 503;
    throw e;
  }

  let lastError = 'The AI service is unavailable right now.';

  // Two passes over the model chain; transient "high demand" spikes usually clear
  // in a couple of seconds, so the farmer sees an answer instead of an error.
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) await sleep(1200);

    for (const model of modelChain()) {
      // 1) normal attempt (thinking off — faster and never eats the output budget)
      let out = await callModel(model, { contents, system, temperature, maxTokens, noThink: true });

      // Some models reject thinkingConfig with a generic "invalid argument" —
      // so on ANY 400, retry the same model once with thinking left alone.
      if (!out.ok && out.status === 400) {
        const retry = await callModel(model, { contents, system, temperature, maxTokens, noThink: false });
        out = retry.ok ? retry : { ...out, message: retry.message || out.message };
      }

      // 2) empty because the model still spent its budget thinking → retry bigger
      if (out.ok && !out.text && out.finishReason === 'MAX_TOKENS') {
        out = await callModel(model, {
          contents, system, temperature, maxTokens: Math.min(maxTokens * 3, 8192), noThink: true,
        });
      }

      if (out.ok && out.text) return { text: out.text, model };

      if (out.ok && !out.text) {
        if (out.finishReason === 'SAFETY') {
          const e = new Error('I could not answer that one safely. Please ask in a different way.');
          e.status = 400;
          throw e;
        }
        lastError = 'The AI returned an empty answer.';
        continue; // try the next model
      }

      lastError = out.message;

      // Genuine client error (bad prompt / bad image) → stop and tell the farmer
      if (!TRANSIENT.includes(out.status) && out.status !== 404) {
        const e = new Error(lastError);
        e.status = 400;
        throw e;
      }
      // 404 = retired, 429 = quota, 5xx = busy → next model, then next pass
    }
  }

  const e = new Error('The AI is busy right now. Please ask again in a few seconds.');
  e.status = 503;
  e.cause = lastError;
  throw e;
}

/** Convenience: single text prompt → string */
export async function generateText(prompt, opts = {}) {
  const { text } = await generate({ contents: [{ role: 'user', parts: [{ text: prompt }] }], ...opts });
  return text;
}

/** Convenience: prompt + image data URL → string */
export async function generateWithImage(prompt, imageDataUrl, opts = {}) {
  const part = dataUrlToPart(imageDataUrl);
  if (!part) {
    const e = new Error('That photo could not be read. Please try another one.');
    e.status = 400;
    throw e;
  }
  const { text } = await generate({
    contents: [{ role: 'user', parts: [{ text: prompt }, part] }],
    ...opts,
  });
  return text;
}

export { dataUrlToPart };
