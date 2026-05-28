// src/services/dataLayer.js
// Unified data access layer.
// Routes every read/write through Firebase (primary) or Google Sheets (legacy fallback).
// When Firebase is enabled, writes are additionally mirrored to Sheets if sheetMirrorEnabled=true.

import * as fbDB from './firebaseDB.js';
import * as sheetDB from './db.js';
import { mirrorWrite } from './sheetMirror.js';

// ─── helper ──────────────────────────────────────────────────────────────────

function getConfig(getAppState) {
  const s = getAppState ? getAppState().settings : {};
  return {
    useFirebase: !!s?.firebaseEnabled,
    sheetMirror: !!s?.sheetMirrorEnabled,
  };
}

function getUserId(getAppState) {
  const state = getAppState ? getAppState() : {};
  return state.auth?.uid || state.auth?.user?.ID || state.auth?.user?.uid || null;
}

function isAdmin(getAppState) {
  const state = getAppState ? getAppState() : {};
  const role = String(state.auth?.user?.Role || state.auth?.user?.role || '').toLowerCase();
  return role === 'admin';
}

function mirror(action, payload, getAppState) {
  const { sheetMirror } = getConfig(getAppState);
  if (sheetMirror) mirrorWrite(action, payload, getAppState);
}

// ─── getAllData ───────────────────────────────────────────────────────────────

export async function getAllData(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const admin = isAdmin(getAppState);
    return fbDB.fbGetAllData(uid, admin);
  }
  return sheetDB.getAllData(payload, getAppState);
}

// ─── Trials ──────────────────────────────────────────────────────────────────

export async function getTrials(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = isAdmin(getAppState) ? null : getUserId(getAppState);
    return fbDB.fbGetTrials(uid);
  }
  return sheetDB.getTrials(payload, getAppState);
}

export async function addTrial(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbAddTrial(payload, uid);
    mirror('addTrial', payload, getAppState);
    return result;
  }
  return sheetDB.addTrial(payload, getAppState);
}

export async function updateTrial(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const result = await fbDB.fbUpdateTrial(payload);
    mirror('updateTrialRecord', payload, getAppState);
    return result;
  }
  return sheetDB.updateTrial(payload, getAppState);
}

export async function deleteTrial(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const result = await fbDB.fbDeleteTrial(payload.id || payload.ID);
    mirror('deleteTrialRecord', payload, getAppState);
    return result;
  }
  return sheetDB.deleteTrial(payload, getAppState);
}

export async function addBatchTrials(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const trials = payload.trials || [];
    const result = await fbDB.fbBatchWrite('trials', trials, uid);
    mirror('addBatchTrials', payload, getAppState);
    return result;
  }
  return sheetDB.addBatchTrials(payload, getAppState);
}

export async function finalizeTrial(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const result = await fbDB.fbUpdateTrial({ ...payload, ControlFinalized: true, FinalizationDate: new Date().toISOString() });
    mirror('finalizeTrial', payload, getAppState);
    return result;
  }
  return sheetDB.finalizeTrial(payload, getAppState);
}

export async function updateTrialStatus(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const result = await fbDB.fbUpdateTrial(payload);
    mirror('updateTrialStatus', payload, getAppState);
    return result;
  }
  return sheetDB.updateTrialStatus(payload, getAppState);
}

// ─── Formulations ────────────────────────────────────────────────────────────

export async function getFormulations(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = isAdmin(getAppState) ? null : getUserId(getAppState);
    return fbDB.fbGetFormulations(uid);
  }
  return sheetDB.getFormulations(payload, getAppState);
}

export async function addFormulation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbAddFormulation(payload, uid);
    mirror('addFormulation', payload, getAppState);
    return result;
  }
  return sheetDB.addFormulation(payload, getAppState);
}

export async function updateFormulation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const result = await fbDB.fbUpdateFormulation(payload);
    mirror('updateFormulation', payload, getAppState);
    return result;
  }
  return sheetDB.apiCall('updateFormulation', payload, true, getAppState);
}

export async function deleteFormulation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const result = await fbDB.fbDeleteFormulation(payload.id || payload.ID);
    mirror('deleteFormulation', payload, getAppState);
    return result;
  }
  return sheetDB.deleteFormulation(payload, getAppState);
}

// ─── Ingredients ─────────────────────────────────────────────────────────────

export async function getIngredients(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = isAdmin(getAppState) ? null : getUserId(getAppState);
    return fbDB.fbGetIngredients(uid);
  }
  return sheetDB.getIngredients(payload, getAppState);
}

export async function addIngredient(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbAddIngredient(payload, uid);
    mirror('addIngredient', payload, getAppState);
    return result;
  }
  return sheetDB.addIngredient(payload, getAppState);
}

export async function deleteIngredient(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const result = await fbDB.fbDeleteIngredient(payload.id || payload.ID);
    mirror('deleteIngredient', payload, getAppState);
    return result;
  }
  return sheetDB.deleteIngredient(payload, getAppState);
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function getProjects(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = isAdmin(getAppState) ? null : getUserId(getAppState);
    return fbDB.fbGetProjects(uid);
  }
  return sheetDB.getProjects(payload, getAppState);
}

export async function addProject(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbAddProject(payload, uid);
    mirror('addProject', payload, getAppState);
    return result;
  }
  return sheetDB.addProject(payload, getAppState);
}

export async function updateProject(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const result = await fbDB.fbUpdateProject(payload);
    mirror('updateProject', payload, getAppState);
    return result;
  }
  return sheetDB.updateProject(payload, getAppState);
}

export async function deleteProject(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const result = await fbDB.fbDeleteProject(payload.id || payload.ID);
    mirror('deleteProject', payload, getAppState);
    return result;
  }
  return sheetDB.deleteProject(payload, getAppState);
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

export async function addBlock(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbAddBlock(payload, uid);
    mirror('addBlock', payload, getAppState);
    return result;
  }
  return sheetDB.addBlock(payload, getAppState);
}

// ─── Organisations ───────────────────────────────────────────────────────────

export async function getOrganisations(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = isAdmin(getAppState) ? null : getUserId(getAppState);
    return fbDB.fbGetOrganisations(uid);
  }
  return sheetDB.getOrganisations(payload, getAppState);
}

export async function addOrganisation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbAddOrganisation(payload, uid);
    mirror('addOrganisation', payload, getAppState);
    return result;
  }
  return sheetDB.addOrganisation(payload, getAppState);
}

export async function deleteOrganisation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const result = await fbDB.fbDeleteOrganisation(payload.id || payload.ID);
    mirror('deleteOrganisation', payload, getAppState);
    return result;
  }
  return sheetDB.deleteOrganisation(payload, getAppState);
}

// ─── Users (admin) ────────────────────────────────────────────────────────────

export async function getUsers(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const { fbGetAllUsers } = await import('./firebaseAuth.js');
    return fbGetAllUsers();
  }
  return sheetDB.getUsers(payload, getAppState);
}

export async function updateUser(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const { fbUpdateUserProfile } = await import('./firebaseAuth.js');
    const uid = payload.uid || payload.ID || payload.id;
    return fbUpdateUserProfile(uid, payload);
  }
  return sheetDB.updateUser(payload, getAppState);
}

// ─── Embeddings (pass-through — stored in Firestore same way) ────────────────

export async function upsertEmbedding(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    return fbDB.fbAdd('embeddingsAll', payload, uid);
  }
  return sheetDB.upsertEmbedding(payload, getAppState);
}

export async function loadSmartIndex(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = isAdmin(getAppState) ? null : getUserId(getAppState);
    return fbDB.fbGetAll('embeddingsAll', uid);
  }
  return sheetDB.loadSmartIndex(payload, getAppState);
}

export async function clearSmartEmbeddings(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    return { success: true, message: 'Use Firebase console to clear embeddings.' };
  }
  return sheetDB.clearSmartEmbeddings(payload, getAppState);
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────
// Photos MUST go to Google Drive. The Apps Script is the only server-side proxy
// that can authenticate with Drive from the browser.
// This works regardless of whether Firebase or Sheet mode is active —
// Firebase stores trial metadata, Drive stores the photo files.
// Without a scriptUrl there is no path to Drive: return a clear error.

export async function uploadPhoto(payload, getAppState) {
  const state = getAppState ? getAppState() : {};
  const hasScript = !!(state?.settings?.scriptUrl?.trim());

  if (!hasScript) {
    return {
      _errType: 'config',
      message: 'Google Drive upload requires the Apps Script URL to be set in Settings → Script URL. Photos cannot be saved without it.',
    };
  }

  return sheetDB.apiCall('uploadPhoto', payload, false, getAppState);
}

// ─── Re-export apiCall for anything that still needs raw access ───────────────
export { apiCall } from './db.js';
