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

/** Ordered fallback chain — first that answers wins. */
export function modelChain(primary = env.GEMINI_MODEL) {
  return [...new Set([
    primary,
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash',
    'gemini-3.5-flash',
  ].filter(Boolean))];
}

const dataUrlToPart = (dataUrl) => {
  const m = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl));
  if (!m) return null;
  return { inline_data: { mime_type: m[1], data: m[2] } };
};

/**
 * @param {object}   opts
 * @param {Array}    opts.contents      Gemini contents array (role + parts)
 * @param {string}   [opts.system]      system instruction
 * @param {number}   [opts.temperature]
 * @param {number}   [opts.maxTokens]
 * @returns {Promise<{text:string, model:string}>}
 */
export async function generate({ contents, system, temperature = 0.7, maxTokens = 900 }) {
  if (!env.GEMINI_API_KEY) {
    const e = new Error('AI is not configured on the server yet.');
    e.status = 503;
    throw e;
  }

  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  let lastError = 'The AI service is unavailable right now.';
  for (const model of modelChain()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);
    try {
      const res = await fetch(`${API_ROOT}/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        lastError = json?.error?.message || `AI request failed (${res.status})`;
        // 404 = model retired, 429 = quota, 503 = busy → try the next model
        if ([404, 429, 500, 503].includes(res.status)) continue;
        const e = new Error(lastError);
        e.status = res.status === 400 ? 400 : 502;
        throw e;
      }

      const candidate = json?.candidates?.[0];
      const text = (candidate?.content?.parts || [])
        .map((p) => p?.text || '')
        .join('')
        .trim();

      if (!text) {
        if (candidate?.finishReason === 'SAFETY') {
          const e = new Error('I could not answer that one safely. Please ask in a different way.');
          e.status = 400;
          throw e;
        }
        lastError = 'The AI returned an empty answer.';
        continue;
      }
      return { text, model };
    } catch (err) {
      clearTimeout(timer);
      if (err.status) throw err; // real, actionable error
      lastError = err.name === 'AbortError' ? 'The AI took too long to answer. Please try again.' : err.message;
    }
  }

  const e = new Error(lastError);
  e.status = 502;
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
