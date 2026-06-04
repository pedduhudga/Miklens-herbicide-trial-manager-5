// src/services/sheetMirror.js
// Plan B: background write-mirror to Google Sheets.
// - Writes are queued and flushed in the background — they NEVER block the UI.
// - Reads from Google Sheets are ONLY allowed when the caller has Admin role AND
//   explicitly requests it via fetchFromSheet().
// - The mirror can be toggled on/off via settings.sheetMirrorEnabled.

import { apiCall } from './db.js';

const MIRROR_QUEUE_KEY = 'sheetMirrorQueue';
let _isFlushing = false;

// ─── Queue helpers ────────────────────────────────────────────────────────────

function loadQueue() {
  try {
    const raw = localStorage.getItem(MIRROR_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(q) {
  localStorage.setItem(MIRROR_QUEUE_KEY, JSON.stringify(q));
}

function enqueue(action, payload) {
  const q = loadQueue();
  q.push({ id: Date.now().toString() + Math.random().toString(36).slice(2), action, payload, attempts: 0, ts: new Date().toISOString() });
  saveQueue(q);
}

function dequeue(id) {
  const q = loadQueue().filter(item => item.id !== id);
  saveQueue(q);
}

function markFailed(id) {
  const q = loadQueue().map(item =>
    item.id === id ? { ...item, attempts: (item.attempts || 0) + 1, lastError: new Date().toISOString() } : item
  );
  saveQueue(q);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Queue a write operation to Google Sheets.
 * Called after every successful Firebase write when sheetMirrorEnabled = true.
 * @param {string} action - Google Apps Script action name (e.g. 'addTrial')
 * @param {object} payload - Data payload for the action
 */
export function mirrorWrite(action, payload, getAppState) {
  const state = getAppState ? getAppState() : null;
  if (!state?.settings?.sheetMirrorEnabled) return;
  if (!state?.settings?.scriptUrl) return;
  enqueue(action, payload);
  // Flush asynchronously
  setTimeout(() => flushMirrorQueue(getAppState), 0);
}

/**
 * Flush queued writes to Google Sheets in the background.
 * Retries up to 3 times per item, then gives up silently.
 */
export async function flushMirrorQueue(getAppState) {
  if (_isFlushing) return;
  if (!navigator.onLine) return;

  const state = getAppState ? getAppState() : null;
  if (!state?.settings?.sheetMirrorEnabled) return;
  if (!state?.settings?.scriptUrl) return;

  _isFlushing = true;
  try {
    const queue = loadQueue();
    if (queue.length === 0) return;

    for (const item of queue) {
      if ((item.attempts || 0) >= 3) {
        dequeue(item.id);
        console.warn('[SheetMirror] Giving up on item after 3 attempts:', item.action);
        continue;
      }

      try {
        const result = await apiCall(item.action, item.payload, false, getAppState);
        if (result?._errType) throw new Error(result.message);
        dequeue(item.id);
        console.log('[SheetMirror] Mirrored:', item.action);
      } catch (err) {
        markFailed(item.id);
        console.warn('[SheetMirror] Write failed (will retry):', item.action, err.message);
        break; // Stop on first failure; retry next flush
      }
    }
  } finally {
    _isFlushing = false;
  }
}

/**
 * How many items are waiting to be mirrored.
 */
export function getMirrorQueueLength() {
  return loadQueue().length;
}

export function getMirrorQueue() {
  return loadQueue();
}

export function clearMirrorQueue() {
  saveQueue([]);
}

/**
 * ADMIN ONLY: Fetch data from Google Sheets (for migration / comparison).
 * Throws if the caller is not an admin.
 */
export async function fetchFromSheet(action, payload, getAppState, auth) {
  const role = String(auth?.Role || auth?.role || '').toLowerCase();
  if (role !== 'admin') {
    throw new Error('Access denied: only admins can read from Google Sheets.');
  }
  return apiCall(action, payload, false, getAppState);
}
