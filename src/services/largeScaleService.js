// src/services/largeScaleService.js
// Firestore operations for Large Scale Field Trials stored inside Projects collection (no subcollections)

import {
  doc,
  getDoc,
  updateDoc,
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

async function getProjectDoc(projectId) {
  const db = getFirebaseDB();
  const snap = await getDoc(doc(db, 'projects', projectId));
  if (!snap.exists()) throw new Error('Project not found');
  return snap.data();
}

async function updateProjectDoc(projectId, data) {
  const db = getFirebaseDB();
  await updateDoc(doc(db, 'projects', projectId), {
    ...data,
    _updatedAt: serverTimestamp()
  });
}

// --- SECTORS ---
export async function fbGetSectors(projectId) {
  const proj = await getProjectDoc(projectId);
  return proj.sectors || [];
}

export async function fbAddSector(projectId, sectorData, userId) {
  const proj = await getProjectDoc(projectId);
  const sectors = proj.sectors || [];
  const sectorId = sectorData.ID || sectorData.id || crypto.randomUUID();
  const record = cleanForFirestore({
    ...sectorData,
    ID: sectorId,
    CreatedBy: userId || '',
    _createdAt: new Date().toISOString()
  });
  sectors.push(record);
  await updateProjectDoc(projectId, { sectors });
  return record;
}

export async function fbUpdateSector(projectId, sectorData) {
  const proj = await getProjectDoc(projectId);
  const sectors = proj.sectors || [];
  const sectorId = sectorData.ID || sectorData.id;
  if (!sectorId) throw new Error('Sector ID required for update');
  const idx = sectors.findIndex(s => s.ID === sectorId);
  if (idx !== -1) {
    sectors[idx] = cleanForFirestore({ ...sectors[idx], ...sectorData, _updatedAt: new Date().toISOString() });
    await updateProjectDoc(projectId, { sectors });
  }
  return { success: true, ID: sectorId };
}

export async function fbDeleteSector(projectId, sectorId) {
  const proj = await getProjectDoc(projectId);
  const sectors = (proj.sectors || []).filter(s => s.ID !== sectorId);
  const quadrants = (proj.quadrants || []).filter(q => q.sectorId !== sectorId);
  const visits = (proj.visits || []).filter(v => v.sectorId !== sectorId);
  await updateProjectDoc(projectId, { sectors, quadrants, visits });
  return { success: true, ID: sectorId };
}

// --- QUADRANTS ---
export async function fbGetQuadrants(projectId, sectorId) {
  const proj = await getProjectDoc(projectId);
  const quadrants = proj.quadrants || [];
  return quadrants.filter(q => q.sectorId === sectorId);
}

export async function fbAddQuadrant(projectId, sectorId, quadrantData, userId) {
  const proj = await getProjectDoc(projectId);
  const quadrants = proj.quadrants || [];
  const quadrantId = quadrantData.ID || quadrantData.id || crypto.randomUUID();
  const record = cleanForFirestore({
    ...quadrantData,
    ID: quadrantId,
    sectorId,
    CreatedBy: userId || '',
    _createdAt: new Date().toISOString()
  });
  quadrants.push(record);
  await updateProjectDoc(projectId, { quadrants });
  return record;
}

export async function fbUpdateQuadrant(projectId, sectorId, quadrantData) {
  const proj = await getProjectDoc(projectId);
  const quadrants = proj.quadrants || [];
  const quadrantId = quadrantData.ID || quadrantData.id;
  if (!quadrantId) throw new Error('Quadrant ID required for update');
  const idx = quadrants.findIndex(q => q.ID === quadrantId);
  if (idx !== -1) {
    quadrants[idx] = cleanForFirestore({ ...quadrants[idx], ...quadrantData, sectorId, _updatedAt: new Date().toISOString() });
    await updateProjectDoc(projectId, { quadrants });
  }
  return { success: true, ID: quadrantId };
}

export async function fbDeleteQuadrant(projectId, sectorId, quadrantId) {
  const proj = await getProjectDoc(projectId);
  const quadrants = (proj.quadrants || []).filter(q => q.ID !== quadrantId);
  const visits = (proj.visits || []).filter(v => v.quadrantId !== quadrantId);
  await updateProjectDoc(projectId, { quadrants, visits });
  return { success: true, ID: quadrantId };
}

// --- VISITS ---
export async function fbGetVisits(projectId, sectorId, quadrantId) {
  const proj = await getProjectDoc(projectId);
  const visits = proj.visits || [];
  return visits.filter(v => v.quadrantId === quadrantId);
}

export async function fbAddVisit(projectId, sectorId, quadrantId, visitData, userId) {
  const proj = await getProjectDoc(projectId);
  const visits = proj.visits || [];
  const visitId = visitData.ID || visitData.id || crypto.randomUUID();
  const record = cleanForFirestore({
    ...visitData,
    ID: visitId,
    sectorId,
    quadrantId,
    CreatedBy: userId || '',
    _createdAt: new Date().toISOString()
  });
  visits.push(record);
  await updateProjectDoc(projectId, { visits });
  return record;
}

export async function fbUpdateVisit(projectId, sectorId, quadrantId, visitData) {
  const proj = await getProjectDoc(projectId);
  const visits = proj.visits || [];
  const visitId = visitData.ID || visitData.id;
  if (!visitId) throw new Error('Visit ID required for update');
  const idx = visits.findIndex(v => v.ID === visitId);
  if (idx !== -1) {
    visits[idx] = cleanForFirestore({ ...visits[idx], ...visitData, sectorId, quadrantId, _updatedAt: new Date().toISOString() });
    await updateProjectDoc(projectId, { visits });
  }
  return { success: true, ID: visitId };
}

export async function fbDeleteVisit(projectId, sectorId, quadrantId, visitId) {
  const proj = await getProjectDoc(projectId);
  const visits = (proj.visits || []).filter(v => v.ID !== visitId);
  await updateProjectDoc(projectId, { visits });
  return { success: true, ID: visitId };
}

// --- BULK FETCH LARGE SCALE PROJECT DATA ---
export async function fbGetLargeScaleData(projectId) {
  const proj = await getProjectDoc(projectId);
  const sectors = proj.sectors || [];
  const quadrants = proj.quadrants || [];
  const visits = proj.visits || [];

  const quadrantsMap = {};
  sectors.forEach(sector => {
    const sectorQuads = quadrants.filter(q => q.sectorId === sector.ID);
    const quadsWithVisits = sectorQuads.map(quad => {
      const quadVisits = visits.filter(v => v.quadrantId === quad.ID);
      return { ...quad, visits: quadVisits };
    });
    quadrantsMap[sector.ID] = quadsWithVisits;
  });

  return {
    sectors,
    quadrantsMap
  };
}
