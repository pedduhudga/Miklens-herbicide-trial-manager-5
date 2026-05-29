// src/services/firebaseDB.js
// All Firestore CRUD operations.  Mirrors the shape of src/services/db.js so
// the rest of the app can call these with minimal changes.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getFirebaseDB, COLLECTIONS } from "./firebase.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function cleanForFirestore(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function snapToRecord(snap) {
  return snap.exists() ? { ID: snap.id, ...snap.data() } : null;
}

function snapsToArray(snapshot) {
  return snapshot.docs.map((d) => ({ ID: d.id, ...d.data() }));
}

// ─── generic CRUD ───────────────────────────────────────────────────────────

export async function fbGetAll(collectionName, userId = null) {
  const db = getFirebaseDB();
  let q = collection(db, collectionName);
  if (userId) {
    q = query(collection(db, collectionName), where("CreatedBy", "==", userId));
  }
  const snap = await getDocs(
    q instanceof Function ? q : collection(db, collectionName),
  );
  return snapsToArray(snap);
}

export async function fbGetById(collectionName, id) {
  const db = getFirebaseDB();
  const snap = await getDoc(doc(db, collectionName, id));
  return snapToRecord(snap);
}

export async function fbAdd(collectionName, data, userId) {
  const db = getFirebaseDB();
  const id = data.ID || data.id || crypto.randomUUID();
  const record = cleanForFirestore({
    ...data,
    ID: id,
    CreatedBy: userId || data.CreatedBy || "",
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, collectionName, id), record);
  return { success: true, ID: id, ...record };
}

export async function fbUpdate(collectionName, data) {
  const db = getFirebaseDB();
  const id = data.ID || data.id;
  if (!id) throw new Error(`fbUpdate: ID required for ${collectionName}`);
  const record = cleanForFirestore({ ...data, _updatedAt: serverTimestamp() });
  delete record.ID;
  delete record.id;
  await updateDoc(doc(db, collectionName, id), record);
  return { success: true, ID: id };
}

export async function fbDelete(collectionName, id) {
  const db = getFirebaseDB();
  if (!id) throw new Error(`fbDelete: ID required for ${collectionName}`);
  await deleteDoc(doc(db, collectionName, id));
  return { success: true, ID: id };
}

export async function fbBatchWrite(collectionName, records, userId) {
  const db = getFirebaseDB();
  const batch = writeBatch(db);
  const ids = [];
  for (const data of records) {
    const id = data.ID || data.id || crypto.randomUUID();
    const record = cleanForFirestore({
      ...data,
      ID: id,
      CreatedBy: userId || data.CreatedBy || "",
      _createdAt: serverTimestamp(),
      _updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, collectionName, id), record);
    ids.push(id);
  }
  await batch.commit();
  return { success: true, count: ids.length, ids };
}

// ─── Trials ─────────────────────────────────────────────────────────────────

export async function fbGetTrials(userId) {
  return fbGetAll(COLLECTIONS.trials, userId);
}

export async function fbAddTrial(data, userId) {
  return fbAdd(COLLECTIONS.trials, data, userId);
}

export async function fbUpdateTrial(data) {
  return fbUpdate(COLLECTIONS.trials, data);
}

export async function fbDeleteTrial(id) {
  return fbDelete(COLLECTIONS.trials, id);
}

// ─── Formulations ────────────────────────────────────────────────────────────

export async function fbGetFormulations(userId) {
  return fbGetAll(COLLECTIONS.formulations, userId);
}

export async function fbAddFormulation(data, userId) {
  return fbAdd(COLLECTIONS.formulations, data, userId);
}

export async function fbUpdateFormulation(data) {
  return fbUpdate(COLLECTIONS.formulations, data);
}

export async function fbDeleteFormulation(id) {
  return fbDelete(COLLECTIONS.formulations, id);
}

// ─── Ingredients ─────────────────────────────────────────────────────────────

export async function fbGetIngredients(userId) {
  return fbGetAll(COLLECTIONS.ingredients, userId);
}

export async function fbAddIngredient(data, userId) {
  return fbAdd(COLLECTIONS.ingredients, data, userId);
}

export async function fbUpdateIngredient(data) {
  return fbUpdate(COLLECTIONS.ingredients, data);
}

export async function fbDeleteIngredient(id) {
  return fbDelete(COLLECTIONS.ingredients, id);
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function fbGetProjects(userId) {
  return fbGetAll(COLLECTIONS.projects, userId);
}

export async function fbAddProject(data, userId) {
  return fbAdd(COLLECTIONS.projects, data, userId);
}

export async function fbUpdateProject(data) {
  return fbUpdate(COLLECTIONS.projects, data);
}

export async function fbDeleteProject(id) {
  return fbDelete(COLLECTIONS.projects, id);
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

export async function fbGetBlocks(userId) {
  return fbGetAll(COLLECTIONS.blocks, userId);
}

export async function fbAddBlock(data, userId) {
  return fbAdd(COLLECTIONS.blocks, data, userId);
}

// ─── Organisations ───────────────────────────────────────────────────────────

export async function fbGetOrganisations(userId) {
  return fbGetAll(COLLECTIONS.organisations, userId);
}

export async function fbAddOrganisation(data, userId) {
  return fbAdd(COLLECTIONS.organisations, data, userId);
}

export async function fbDeleteOrganisation(id) {
  return fbDelete(COLLECTIONS.organisations, id);
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function fbGetUserSettings(userId) {
  if (!userId) return null;
  const db = getFirebaseDB();
  const snap = await getDoc(doc(db, COLLECTIONS.settings, userId));
  return snap.exists() ? snap.data() : null;
}

export async function fbSaveUserSettings(userId, settings) {
  const db = getFirebaseDB();
  await setDoc(
    doc(db, COLLECTIONS.settings, userId),
    {
      ...cleanForFirestore(settings),
      _updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return { success: true };
}

// ─── Global QR settings (publicly readable — controls LiveTrialPage) ─────────
// Stored at settings/globalQR so any device scanning a QR code can read it
// without authentication. Firestore rules must allow:
//   match /settings/globalQR { allow read: if true; }

export async function fbSaveGlobalQRSettings(qrOnlineFields) {
  const db = getFirebaseDB();
  await setDoc(
    doc(db, COLLECTIONS.settings, "globalQR"),
    { qrOnlineFields, _updatedAt: serverTimestamp() },
    { merge: true },
  );
  return { success: true };
}

export async function fbGetGlobalQRSettings() {
  try {
    const db = getFirebaseDB();
    const snap = await getDoc(doc(db, COLLECTIONS.settings, "globalQR"));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

// ─── Analysis Log ────────────────────────────────────────────────────────────

export async function fbAddAnalysisLog(data, userId) {
  return fbAdd(COLLECTIONS.analysisLog, data, userId);
}

// ─── Spray Logs ──────────────────────────────────────────────────────────────

export async function fbGetSprayLogs(userId, projectId = null, trialId = null) {
  const db = getFirebaseDB();
  let conditions = [];
  if (userId) conditions.push(where("CreatedBy", "==", userId));
  if (projectId) conditions.push(where("ProjectID", "==", projectId));
  if (trialId) conditions.push(where("TrialID", "==", trialId));
  const q = conditions.length
    ? query(collection(db, COLLECTIONS.sprayLogs), ...conditions)
    : collection(db, COLLECTIONS.sprayLogs);
  const snap = await getDocs(q);
  return snapsToArray(snap);
}

export async function fbAddSprayLog(data, userId) {
  return fbAdd(COLLECTIONS.sprayLogs, data, userId);
}

// ─── Batch import (migration) ─────────────────────────────────────────────────

/**
 * Imports an entire dataset exported from Google Sheets into Firestore.
 * dataMap shape: { trials: [...], formulations: [...], ... }
 */
export async function fbImportAll(dataMap, userId) {
  const results = {};
  const collectionMap = {
    trials: COLLECTIONS.trials,
    formulations: COLLECTIONS.formulations,
    ingredients: COLLECTIONS.ingredients,
    organisations: COLLECTIONS.organisations,
    projects: COLLECTIONS.projects,
    blocks: COLLECTIONS.blocks,
  };

  for (const [key, col] of Object.entries(collectionMap)) {
    const items = dataMap[key];
    if (!Array.isArray(items) || items.length === 0) {
      results[key] = { count: 0 };
      continue;
    }

    // Firestore batch limit = 500 ops
    const chunks = [];
    for (let i = 0; i < items.length; i += 400) {
      chunks.push(items.slice(i, i + 400));
    }

    let total = 0;
    for (const chunk of chunks) {
      const r = await fbBatchWrite(col, chunk, userId);
      total += r.count;
    }
    results[key] = { count: total };
  }
  return { success: true, results };
}

// ─── getAllData (used on app load) ────────────────────────────────────────────

export async function fbGetAllData(userId, isAdmin = false) {
  const ownerId = isAdmin ? null : userId;
  const [trials, formulations, ingredients, organisations, projects, blocks] =
    await Promise.all([
      fbGetTrials(ownerId),
      fbGetFormulations(ownerId),
      fbGetIngredients(ownerId),
      fbGetOrganisations(ownerId),
      fbGetProjects(ownerId),
      fbGetBlocks(ownerId)
    ]);
  return { trials, formulations, ingredients, organisations, projects, blocks };
}

// ─── AI Chat Sessions ────────────────────────────────────────────────────────
export async function fbGetAiChatSessions(userId) {
  return fbGetAll(COLLECTIONS.aiChatSessions, userId);
}

export async function fbSaveAiChatSession(data, userId) {
  const db = getFirebaseDB();
  const id = data.id || Date.now().toString();
  const record = cleanForFirestore({
    ...data,
    ID: id,
    id: id,
    CreatedBy: userId,
    _updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, COLLECTIONS.aiChatSessions, id), record, { merge: true });
  return record;
}

export async function fbDeleteAiChatSession(id) {
  return fbDelete(COLLECTIONS.aiChatSessions, id);
}
