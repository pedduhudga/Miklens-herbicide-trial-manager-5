// src/services/multiProviderAI.js
// Multi-provider AI photo analysis — ported from herbicide app 10 HTML

const PROVIDERS = [
  {
    id: 'groq',
    name: 'Groq LLaMA 4 Scout',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    dailyLimit: 1000,
  },
  {
    id: 'gemini-flash',
    name: 'Gemini 2.0 Flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    dailyLimit: 1000,
  },
  {
    id: 'gemini',
    name: 'Gemini 2.5 Pro',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    dailyLimit: 25,
  },
  {
    id: 'pixtral',
    name: 'Pixtral (Mistral)',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    model: 'pixtral-12b-2409',
    dailyLimit: 10000,
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
  const baseId = providerId === 'gemini-flash' ? 'gemini' : providerId;

  const keys = [];

  // Check settings object for various key field names
  const settingsKeys = [
    settings?.apiKeys,
    settings?.geminiApiKeys,
    settings?.geminiApiKey ? [settings.geminiApiKey] : null,
  ];
  if (baseId === 'gemini' || baseId === 'gemini-flash') {
    settingsKeys.forEach(k => {
      if (Array.isArray(k)) keys.push(...k.filter(Boolean));
      else if (typeof k === 'string' && k.trim()) keys.push(k.trim());
    });
  }
  if (baseId === 'groq' && settings?.groqApiKey) keys.push(settings.groqApiKey);
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

async function imageToBase64(dataUrlOrUrl) {
  if (typeof dataUrlOrUrl === 'string' && dataUrlOrUrl.startsWith('data:')) {
    return dataUrlOrUrl.split(',')[1];
  }
  // For remote URLs, fetch and convert
  const response = await fetch(dataUrlOrUrl);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function callGemini(provider, imageData, context, apiKey) {
  const base64 = await imageToBase64(imageData);
  const mimeType = typeof imageData === 'string' && imageData.startsWith('data:')
    ? imageData.split(';')[0].split(':')[1]
    : 'image/jpeg';

  const response = await fetch(`${provider.endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: buildPrompt(context) },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]
      }]
    })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status}: ${err.slice(0, 200)}`);
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
    throw new Error(`Groq ${response.status}: ${err.slice(0, 200)}`);
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
  if (!response.ok) throw new Error(`Pixtral ${response.status}`);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty Pixtral response');
  return parseAIJson(text);
}

async function callProvider(provider, imageData, context, apiKey) {
  if (provider.id === 'groq') return callGroq(provider, imageData, context, apiKey);
  if (provider.id === 'gemini' || provider.id === 'gemini-flash') return callGemini(provider, imageData, context, apiKey);
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
export async function analyzePhoto(imageData, context = {}, onProgress = null) {
  let usage = loadUsage();
  const delay = ms => new Promise(res => setTimeout(res, ms));

  for (const provider of PROVIDERS) {
    const keys = getAPIKeys(provider.id);
    if (!keys.length) continue;

    for (let ki = 0; ki < keys.length; ki++) {
      if (!hasQuota(provider, ki, usage)) continue;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (onProgress) onProgress(`Analyzing with ${provider.name}${attempt > 1 ? ` (attempt ${attempt})` : ''}...`);
          const result = await callProvider(provider, imageData, context, keys[ki]);
          usage = incrementUsage(provider, ki, usage);
          return { success: true, provider: provider.name, data: result };
        } catch (err) {
          console.warn(`[AI] ${provider.name} key ${ki + 1} attempt ${attempt} failed:`, err.message);
          if (attempt < 3) await delay(3000);
        }
      }
    }
  }

  return { success: false, error: 'All AI providers failed. Check your API keys in Settings.' };
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
