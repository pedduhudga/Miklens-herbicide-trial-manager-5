// src/services/multiProviderAI.js
// Multi-provider AI photo analysis — ported from herbicide app 10 HTML


// Provider order = fallback priority (first = tried first).
// Free tier limits per Google AI Studio / Groq free plan.
// All Gemini models support: Text + Image + Video + Audio + PDF inputs.
const PROVIDERS = [
  // ── Gemini 3.x (newest generation, best vision quality) ──────────────────
  {
    // Stable | Free: ~1500 RPD, 30 RPM | Frontier-class, best for high-volume weed analysis
    id: 'gemini-3-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
    dailyLimit: 1500,
  },
  {
    // Stable | Free: ~500 RPD, 15 RPM | Most intelligent Gemini 3, best for agentic weed ID
    id: 'gemini-3-flash',
    name: 'Gemini 3.5 Flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
    dailyLimit: 500,
  },
  {
    // Preview | Free: ~100 RPD, 5 RPM | Frontier preview, deeper reasoning for complex plots
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
    dailyLimit: 100,
  },
  {
    // Preview | Free: ~25 RPD, 5 RPM | Most advanced reasoning — use for AI Summary/Reports
    id: 'gemini-3-pro',
    name: 'Gemini 3.1 Pro Preview',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent',
    dailyLimit: 25,
  },
  // ── Gemini 2.5 (stable fallback series) ─────────────────────────────────
  {
    // Stable | Free: 1500 RPD, 30 RPM | Fast & cheap fallback
    id: 'gemini-flash-lite',
    name: 'Gemini 2.5 Flash-Lite',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
    dailyLimit: 1500,
  },
  {
    // Stable | Free: 250 RPD, 10 RPM | Reliable vision + thinking
    id: 'gemini-flash',
    name: 'Gemini 2.5 Flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    dailyLimit: 250,
  },
  {
    // Stable | Free: 25 RPD, 5 RPM | Deep reasoning fallback
    id: 'gemini',
    name: 'Gemini 2.5 Pro',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    dailyLimit: 25,
  },
  // ── Groq (ultra-fast inference, vision support) ──────────────────────────
  {
    // Preview | Free: ~500 RPD | Best Groq vision model, 5 images/request
    id: 'groq-maverick',
    name: 'Groq LLaMA 4 Maverick',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    dailyLimit: 500,
  },
  {
    // Preview | Free: ~500 RPD | Lightweight fast vision
    id: 'groq',
    name: 'Groq LLaMA 4 Scout',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    dailyLimit: 500,
  },
  // ── Mistral (last resort) ────────────────────────────────────────────────
  {
    // Free: ~50 RPD | Last resort fallback
    id: 'pixtral',
    name: 'Pixtral Large (Mistral)',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    model: 'pixtral-large-2411',
    dailyLimit: 50,
  },
];

function getSettings() {
  try {
    const raw = localStorage.getItem('appSettings');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function getAPIKeys(providerId) {
  const settings = getSettings();
  const isGemini = providerId.startsWith('gemini');
  const isGroq = providerId === 'groq' || providerId === 'groq-maverick';
  const baseId = isGemini ? 'gemini' : isGroq ? 'groq' : providerId;

  const keys = [];

  const settingsKeys = [
    settings?.apiKeys,
    settings?.geminiApiKeys,
    settings?.geminiApiKey ? [settings.geminiApiKey] : null,
  ];
  if (isGemini) {
    settingsKeys.forEach(k => {
      if (Array.isArray(k)) keys.push(...k.filter(Boolean));
      else if (typeof k === 'string' && k.trim()) keys.push(k.trim());
    });
  }
  if (isGroq && settings?.groqApiKey) keys.push(settings.groqApiKey);
  if (baseId === 'pixtral' && settings?.mistralApiKey) keys.push(settings.mistralApiKey);

  // Also check localStorage directly
  const lsBase = localStorage.getItem(`AI_KEY_${baseId.toUpperCase()}`);
  if (lsBase) keys.push(lsBase);
  for (let i = 1; i <= 5; i++) {
    const k = localStorage.getItem(`AI_KEY_${baseId.toUpperCase()}_${i}`);
    if (k) keys.push(k);
  }

  return [...new Set(keys.filter(Boolean))];
}

function loadUsage() {
  try {
    const data = JSON.parse(localStorage.getItem('ai_provider_usage') || '{}');
    const today = new Date().toISOString().split('T')[0];
    if (data.date !== today) return {};
    return data.usage || {};
  } catch { return {}; }
}

function saveUsage(usage) {
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem('ai_provider_usage', JSON.stringify({ date: today, usage }));
}

function hasQuota(provider, keyIndex, usage) {
  const key = `${provider.id}_${keyIndex}`;
  return (usage[key] || 0) < provider.dailyLimit;
}

function incrementUsage(provider, keyIndex, usage) {
  const key = `${provider.id}_${keyIndex}`;
  const updated = { ...usage, [key]: (usage[key] || 0) + 1 };
  saveUsage(updated);
  return updated;
}

function buildPrompt(context) {
  const historyNote = context.historyPrompt ? `\n${context.historyPrompt}\n` : '';
  return `You are an agricultural weed science expert analyzing a herbicide trial plot photo. Provide a rigorous, scientifically accurate assessment.

PLOT INFORMATION:
- Treatment/Herbicide: ${context.treatment || 'Unknown'}
- Days After Application (DAA): ${context.daa ?? 0}
- Replication: ${context.rep || 1}
${historyNote}

SCIENTIFIC ANALYSIS TASKS:
1. **Weed Species Identification**: Identify all visible weed species using common names. Be specific (e.g., "Barnyard Grass/Echinochloa crus-galli", "Horse Purslane/Trianthema portulacastrum").

2. **Ground Cover Estimation**: For each species, estimate percentage ground cover (0-100%). Sum should approximate total weed pressure.

3. **Phytotoxicity Assessment**: Classify herbicide response for each weed:
   - "Healthy" - No visible herbicide effect
   - "Slight Injury" - Minor leaf spotting/curling
   - "Moderate Injury" - Significant chlorosis/necrosis
   - "Severe Injury" - Heavy necrosis, stunted
   - "Dead/Desiccated" - Brown/dry, no green tissue
   - "Burndown" - Rapid wilting/browning (contact effect)

4. **Growth Stage**: Note stage (Seedling, Vegetative, Flowering, Mature)

5. **Competition Level**: Classify overall pressure (None, Low, Moderate, High, Severe)

6. **Confidence**: Rate as LOW, MEDIUM, or HIGH

OUTPUT FORMAT - JSON ONLY:
{
  "weeds": [
    {"species": "Common Name", "cover": 25, "status": "Dead/Desiccated", "growthStage": "Vegetative", "notes": "Complete browning, no regrowth"}
  ],
  "totalWeedCover": 45,
  "competitionLevel": "Moderate",
  "dominantSpecies": "Primary species",
  "confidence": "HIGH",
  "efficacyAssessment": "Good control, ~80% reduction",
  "notes": "Clear photo. Some regrowth in corners.",
  "recommendations": "Continue monitoring for late-emerging weeds"
}`;
}

function parseAIJson(text) {
  const match = text.match(/```json\n([\s\S]*?)\n```/) ||
    text.match(/```\n([\s\S]*?)\n```/) ||
    text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in AI response');
  return JSON.parse(match[1] || match[0]);
}

function encodeImageViaCanvas(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const MAX = 1024;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (!w || !h) return reject(new Error('Image has zero dimensions'));
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      canvas.width = w;
      canvas.height = h;
      try {
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const jpeg = canvas.toDataURL('image/jpeg', 0.85);
        if (!jpeg || jpeg === 'data:,') return reject(new Error('Canvas produced empty image'));
        resolve(jpeg.split(',')[1]);
      } catch (e) {
        reject(new Error('Canvas draw failed (possible CORS taint): ' + e.message));
      }
    };
    img.onerror = () => reject(new Error('Image failed to load: ' + src.slice(0, 80)));
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

async function imageToBase64(dataUrlOrUrl) {
  // Already a data URL — encode via canvas to normalise format/size
  if (typeof dataUrlOrUrl === 'string' && dataUrlOrUrl.startsWith('data:')) {
    return encodeImageViaCanvas(dataUrlOrUrl);
  }

  // Remote URL: try fetch first (works for same-origin / CORS-enabled URLs)
  // For Google Drive thumbnails and other CORS-restricted URLs, fall back to img element
  try {
    const response = await fetch(dataUrlOrUrl, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const dataUrl = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
    return encodeImageViaCanvas(dataUrl);
  } catch (fetchErr) {
    // Fetch failed (CORS / Drive auth) — load via <img> element instead
    console.warn('[AI] fetch failed, trying img load:', fetchErr.message);
    return encodeImageViaCanvas(dataUrlOrUrl);
  }
}

async function callGemini(provider, imageData, context, apiKey) {
  const base64 = await imageToBase64(imageData);
  const mimeType = 'image/jpeg'; // always JPEG after canvas re-encode

  const response = await fetch(`${provider.endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: buildPrompt(context) },
          { inlineData: { mimeType, data: base64 } }
        ]
      }]
    })
  });
  if (!response.ok) {
    const err = await response.text();
    const e = new Error(`Gemini ${response.status}: ${err.slice(0, 200)}`);
    e.status = response.status;
    throw e;
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return parseAIJson(text);
}

async function callGroq(provider, imageData, context, apiKey) {
  const base64 = await imageToBase64(imageData);
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt(context) },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ]
      }],
      temperature: 0.2,
      max_tokens: 500
    })
  });
  if (!response.ok) {
    const err = await response.text();
    const e = new Error(`Groq ${response.status}: ${err.slice(0, 200)}`);
    e.status = response.status;
    throw e;
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty Groq response');
  return parseAIJson(text);
}

async function callPixtral(provider, imageData, context, apiKey) {
  const base64 = await imageToBase64(imageData);
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt(context) },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ]
      }]
    })
  });
  if (!response.ok) {
    const e = new Error(`Pixtral ${response.status}`);
    e.status = response.status;
    throw e;
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty Pixtral response');
  return parseAIJson(text);
}

async function callProvider(provider, imageData, context, apiKey) {
  if (provider.id === 'groq' || provider.id === 'groq-maverick') return callGroq(provider, imageData, context, apiKey);
  if (provider.id.startsWith('gemini')) return callGemini(provider, imageData, context, apiKey);
  if (provider.id === 'pixtral') return callPixtral(provider, imageData, context, apiKey);
  throw new Error(`Unknown provider: ${provider.id}`);
}

/**
 * Analyze a single photo with AI.
 * @param {string} imageData - dataURL or remote URL
 * @param {object} context - { treatment, daa, rep, historyPrompt }
 * @param {function} onProgress - optional (message: string) => void
 * @returns {{ success: boolean, data?: object, provider?: string, error?: string }}
 */
// Errors where retrying the same image/key will never help
function isNonRetryable(err) {
  const s = err.status;
  if (s === 400 || s === 401 || s === 403) return true;
  const msg = err.message || '';
  if (msg.includes('Unable to process input image')) return true;
  if (msg.includes('Invalid API Key') || msg.includes('invalid_api_key')) return true;
  return false;
}

// 429 = quota exceeded for this key, skip to next key but don't retry
function isQuotaError(err) {
  return err.status === 429 || (err.message || '').includes('429');
}

export async function analyzePhoto(imageData, context = {}, onProgress = null) {
  let usage = loadUsage();
  const delay = ms => new Promise(res => setTimeout(res, ms));
  let imageErrorCount = 0; // track how many providers say image is bad

  for (const provider of PROVIDERS) {
    const keys = getAPIKeys(provider.id);
    if (!keys.length) continue;

    for (let ki = 0; ki < keys.length; ki++) {
      if (!hasQuota(provider, ki, usage)) continue;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          if (onProgress) onProgress(`Trying ${provider.name}${attempt > 1 ? ' (retry)' : ''}...`);
          const result = await callProvider(provider, imageData, context, keys[ki]);
          usage = incrementUsage(provider, ki, usage);
          return { success: true, provider: provider.name, data: result };
        } catch (err) {
          console.warn(`[AI] ${provider.name} key ${ki + 1} attempt ${attempt} failed:`, err.message);
          if (isNonRetryable(err)) {
            // 400 bad image — no point trying other keys or attempts for this provider
            if (err.status === 400 || (err.message || '').includes('Unable to process input image')) {
              imageErrorCount++;
              break; // skip to next provider
            }
            break; // 401/403 — bad key, skip remaining attempts for this key
          }
          if (isQuotaError(err)) break; // 429 — skip this key, try next
          if (attempt < 2) await delay(2000);
        }
      }
    }
  }

  // If every provider said bad image, give a clear user-facing message
  if (imageErrorCount >= 3) {
    return { success: false, error: 'Image could not be processed by any AI provider. Try re-capturing or cropping the photo and try again.' };
  }

  return { success: false, error: 'All AI providers exhausted. Check your API keys in Settings.' };
}

/**
 * Analyze multiple photos sequentially with progress callback.
 * @param {Array<{imageData, trialId, treatment, daa, rep}>} items
 * @param {function} onProgress - ({ current, total, trialId, message }) => void
 * @param {function} onResult - ({ trialId, daa, data }) => void
 */
export async function analyzePhotosBatch(items, onProgress, onResult) {
  const delay = ms => new Promise(res => setTimeout(res, ms));
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (onProgress) onProgress({ current: i + 1, total: items.length, trialId: item.trialId, message: `Analyzing photo ${i + 1}/${items.length}` });

    const result = await analyzePhoto(item.imageData, {
      treatment: item.treatment,
      daa: item.daa,
      rep: item.rep,
    }, (msg) => {
      if (onProgress) onProgress({ current: i + 1, total: items.length, trialId: item.trialId, message: msg });
    });

    if (result.success && result.data) {
      if (onResult) await onResult({ trialId: item.trialId, daa: item.daa, data: result.data });
    }

    if (i < items.length - 1) await delay(4000);
  }
}

/**
 * Save AI keys to localStorage (used by Settings page).
 */
export function saveAIKey(providerId, key) {
  localStorage.setItem(`AI_KEY_${providerId.toUpperCase()}`, key.trim());
}

export function getAIKey(providerId) {
  return localStorage.getItem(`AI_KEY_${providerId.toUpperCase()}`) || '';
}

export { PROVIDERS, getAPIKeys };
