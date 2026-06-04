// src/services/largeScaleService.js
// Firestore operations for Large Scale Field Trials (Sectors -> Quadrants -> Visits)

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { getFirebaseDB } from './firebase.js';

function cleanForFirestore(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

// --- SECTORS ---
export async function fbGetSectors(projectId) {
  const db = getFirebaseDB();
  const colRef = collection(db, 'projects', projectId, 'sectors');
  const snap = await getDocs(colRef);
  return snap.docs.map(d => ({ ID: d.id, ...d.data() }));
}

export async function fbAddSector(projectId, sectorData, userId) {
  const db = getFirebaseDB();
  const sectorId = sectorData.ID || sectorData.id || crypto.randomUUID();
  const record = cleanForFirestore({
    ...sectorData,
    ID: sectorId,
    CreatedBy: userId || '',
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp()
  });
  await setDoc(doc(db, 'projects', projectId, 'sectors', sectorId), record);
  return { success: true, ID: sectorId, ...record };
}

export async function fbUpdateSector(projectId, sectorData) {
  const db = getFirebaseDB();
  const sectorId = sectorData.ID || sectorData.id;
  if (!sectorId) throw new Error('Sector ID required for update');
  const record = cleanForFirestore({ ...sectorData, _updatedAt: serverTimestamp() });
  delete record.ID;
  delete record.id;
  await updateDoc(doc(db, 'projects', projectId, 'sectors', sectorId), record);
  return { success: true, ID: sectorId };
}

export async function fbDeleteSector(projectId, sectorId) {
  const db = getFirebaseDB();
  await deleteDoc(doc(db, 'projects', projectId, 'sectors', sectorId));
  return { success: true, ID: sectorId };
}

// --- QUADRANTS ---
export async function fbGetQuadrants(projectId, sectorId) {
  const db = getFirebaseDB();
  const colRef = collection(db, 'projects', projectId, 'sectors', sectorId, 'quadrants');
  const snap = await getDocs(colRef);
  return snap.docs.map(d => ({ ID: d.id, ...d.data() }));
}

export async function fbAddQuadrant(projectId, sectorId, quadrantData, userId) {
  const db = getFirebaseDB();
  const quadrantId = quadrantData.ID || quadrantData.id || crypto.randomUUID();
  const record = cleanForFirestore({
    ...quadrantData,
    ID: quadrantId,
    CreatedBy: userId || '',
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp()
  });
  await setDoc(doc(db, 'projects', projectId, 'sectors', sectorId, 'quadrants', quadrantId), record);
  return { success: true, ID: quadrantId, ...record };
}

export async function fbUpdateQuadrant(projectId, sectorId, quadrantData) {
  const db = getFirebaseDB();
  const quadrantId = quadrantData.ID || quadrantData.id;
  if (!quadrantId) throw new Error('Quadrant ID required for update');
  const record = cleanForFirestore({ ...quadrantData, _updatedAt: serverTimestamp() });
  delete record.ID;
  delete record.id;
  await updateDoc(doc(db, 'projects', projectId, 'sectors', sectorId, 'quadrants', quadrantId), record);
  return { success: true, ID: quadrantId };
}

export async function fbDeleteQuadrant(projectId, sectorId, quadrantId) {
  const db = getFirebaseDB();
  await deleteDoc(doc(db, 'projects', projectId, 'sectors', sectorId, 'quadrants', quadrantId));
  return { success: true, ID: quadrantId };
}

// --- VISITS ---
export async function fbGetVisits(projectId, sectorId, quadrantId) {
  const db = getFirebaseDB();
  const colRef = collection(db, 'projects', projectId, 'sectors', sectorId, 'quadrants', quadrantId, 'visits');
  const snap = await getDocs(colRef);
  return snap.docs.map(d => ({ ID: d.id, ...d.data() }));
}

export async function fbAddVisit(projectId, sectorId, quadrantId, visitData, userId) {
  const db = getFirebaseDB();
  const visitId = visitData.ID || visitData.id || crypto.randomUUID();
  const record = cleanForFirestore({
    ...visitData,
    ID: visitId,
    CreatedBy: userId || '',
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp()
  });
  await setDoc(doc(db, 'projects', projectId, 'sectors', sectorId, 'quadrants', quadrantId, 'visits', visitId), record);
  return { success: true, ID: visitId, ...record };
}

export async function fbUpdateVisit(projectId, sectorId, quadrantId, visitData) {
  const db = getFirebaseDB();
  const visitId = visitData.ID || visitData.id;
  if (!visitId) throw new Error('Visit ID required for update');
  const record = cleanForFirestore({ ...visitData, _updatedAt: serverTimestamp() });
  delete record.ID;
  delete record.id;
  await updateDoc(doc(db, 'projects', projectId, 'sectors', sectorId, 'quadrants', quadrantId, 'visits', visitId), record);
  return { success: true, ID: visitId };
}

export async function fbDeleteVisit(projectId, sectorId, quadrantId, visitId) {
  const db = getFirebaseDB();
  await deleteDoc(doc(db, 'projects', projectId, 'sectors', sectorId, 'quadrants', quadrantId, 'visits', visitId));
  return { success: true, ID: visitId };
}

// --- BULK FETCH LARGE SCALE PROJECT DATA ---
// Fetches the entire project structure in parallel to minimize roundtrips
export async function fbGetLargeScaleData(projectId) {
  const sectors = await fbGetSectors(projectId);
  
  const quadrantsPromises = sectors.map(async (sector) => {
    const quads = await fbGetQuadrants(projectId, sector.ID);
    
    const quadsWithVisits = await Promise.all(quads.map(async (quad) => {
      const visits = await fbGetVisits(projectId, sector.ID, quad.ID);
      return { ...quad, visits };
    }));

    return { sectorId: sector.ID, quadrants: quadsWithVisits };
  });

  const quadrantsResults = await Promise.all(quadrantsPromises);
  const quadrantsMap = {};
  quadrantsResults.forEach(res => {
    quadrantsMap[res.sectorId] = res.quadrants;
  });

  return {
    sectors,
    quadrantsMap // { [sectorId]: [ { ...quadrant, visits: [...] } ] }
  };
}
