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
1. **Weed Species Identification**: Identify all visible weed species. Write each species as "Common Name (Scientific name)" — Genus capitalised, species lowercase (e.g. "Barnyard Grass (Echinochloa crus-galli)", "Horse Purslane (Trianthema portulacastrum)").

2. **Ground Cover Estimation (CRITICAL FOR EFFICACY)**:
   - Estimate the percentage of the ground covered by *living, active, green* weeds (0-100%).
   - **DO NOT** count weeds that are dead, brown, desiccated, yellow (chlorotic), or bleached white (carotenoid-bleached) as living cover. These are controlled weeds. Only estimate the remaining living green cover.
   - The total weed cover should represent only the surviving green weed pressure.

3. **Herbicidal Injury Response & Symptoms**:
   - Classify the observed treatment response for each weed using:
     - "Unaffected" - Weeds are healthy, growing, and vibrant green.
     - "Slight Injury" - Minor yellowing (chlorosis) or bleaching/whitening at leaf tips.
     - "Moderate Injury" - Moderate yellowing (chlorosis) or bleaching (whitening), partial necrosis (browning), or stunting/wilting.
     - "Severe Injury" - Heavy chlorosis/bleaching, extensive necrosis (browning), or severe wilting/stunting (e.g., ALS/HPPD inhibitor white/bleached symptoms).
     - "Dead/Desiccated" - Weeds are completely dead, dried, and turned entirely brown, yellow, or bleached white, with no surviving green tissue.
     - "Burndown" - Rapid wilting and browning typical of contact herbicides.

4. **Growth Stage**: Record stage as one of: Seedling, Vegetative, Flowering, Mature

5. **Infestation Level**: Classify overall living green weed pressure as: None, Low, Moderate, High, or Severe

6. **Confidence**: Rate image assessment confidence as LOW, MEDIUM, or HIGH

7. **Application Timing**: Estimate the herbicide application timing relative to weed/crop growth stage, choosing one of: PRE (Pre-emergence, bare soil / no weeds emerged), E-POST (Early Post-emergence, small seedlings, 1-3 leaves), POST (Post-emergence, active vegetative growth, 4-6 leaves / tillering), L-POST (Late Post-emergence, mature weeds / flowering / closed canopy). NOTE: If the weeds are already Mature or Flowering, you MUST select L-POST instead of POST.

8. **Overall Weed Growth Stage**: Provide a standardized summary text describing the dominant/overall growth stage of the weeds in the plot (e.g., '2-4 leaf stage', 'tillering', 'seedling', 'flowering', 'pre-emergence', 'mature').

LANGUAGE RULES:
- Do NOT include any recommendations, monitoring suggestions, or next-step advice.
- Do NOT use the words "phytotoxic" or "phytotoxicity".
- The "efficacyAssessment" field must state only what is OBSERVED in this photo at this DAA — no projections or post-application schedules.
- Keep all notes factual and observation-based only.

OUTPUT FORMAT - JSON ONLY (no extra text):
{
  "weeds": [
    {"species": "Common Name (Scientific name)", "cover": 25, "status": "Unaffected", "growthStage": "Vegetative", "notes": "Dense stand, no visible injury observed"}
  ],
  "totalWeedCover": 45,
  "infestationLevel": "Moderate",
  "dominantSpecies": "Primary species name",
  "confidence": "HIGH",
  "efficacyAssessment": "No herbicidal injury observed at DAA 0; baseline assessment.",
  "notes": "Photo quality clear. Mixed infestation noted.",
  "applicationTiming": "POST",
  "overallWeedGrowthStage": "2-4 leaf stage"
}`;
}

function parseAIJson(text) {
  const match = text.match(/```json\n([\s\S]*?)\n```/) ||
    text.match(/```\n([\s\S]*?)\n```/) ||
    text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in AI response');
  return JSON.parse(match[1] || match[0]);
}

function getDriveFileId(url) {
  if (typeof url !== 'string') return null;
  if (!url.includes('drive.google.com')) return null;
  const m = url.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
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

  // Google Drive URLs can NEVER be fetched from browser (CORS block + 302 redirect)
  // Callers that need base64 (Groq, Pixtral) must skip Drive URLs upstream.
  if (getDriveFileId(dataUrlOrUrl)) {
    throw new Error('DRIVE_URL_NO_BASE64');
  }

  // Regular remote URL — try fetch
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
    console.warn('[AI] fetch failed, trying img load:', fetchErr.message);
    return encodeImageViaCanvas(dataUrlOrUrl);
  }
}

async function callGemini(provider, imageData, context, apiKey) {
  // For Google Drive URLs: use fileUri — Gemini API reads Drive files server-side (no CORS issue)
  const driveId = getDriveFileId(imageData);
  let imagePart;
  if (driveId) {
    imagePart = { fileData: { mimeType: 'image/jpeg', fileUri: `https://drive.google.com/uc?export=download&id=${driveId}` } };
  } else {
    const base64 = await imageToBase64(imageData);
    imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64 } };
  }

  const response = await fetch(`${provider.endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: buildPrompt(context) },
          imagePart
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
  // Groq requires base64 — Drive URLs are CORS-blocked, skip immediately
  if (getDriveFileId(imageData)) {
    const e = new Error('Drive images cannot be fetched for Groq (CORS). Use Gemini instead.');
    e.status = 400;
    throw e;
  }
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
  // Pixtral requires base64 — Drive URLs are CORS-blocked, skip immediately
  if (getDriveFileId(imageData)) {
    const e = new Error('Drive images cannot be fetched for Pixtral (CORS). Use Gemini instead.');
    e.status = 400;
    throw e;
  }
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
  if (msg.includes('DRIVE_URL_NO_BASE64') || msg.includes('Drive images cannot be fetched')) return true;
  return false;
}

function isDriveSkip(err) {
  const msg = err.message || '';
  return msg.includes('DRIVE_URL_NO_BASE64') || msg.includes('Drive images cannot be fetched');
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
            if (!isDriveSkip(err) && (err.status === 400 || (err.message || '').includes('Unable to process input image'))) {
              imageErrorCount++;
            }
            break; // skip to next provider/key
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
      if (onResult) await onResult({ trialId: item.trialId, daa: item.daa, data: result.data, photoDate: item.photoDate });
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
