// src/services/largeScaleService.js
// Firestore operations for Large Scale Field Trials stored as a flat observations list inside Project documents

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

// Add a single unified observation
export async function fbAddObservation(projectId, obsData, userId) {
  const proj = await getProjectDoc(projectId);
  const observations = proj.observations || [];
  const obsId = obsData.ID || obsData.id || crypto.randomUUID();
  const record = cleanForFirestore({
    ...obsData,
    ID: obsId,
    id: obsId,
    CreatedBy: userId || '',
    _createdAt: new Date().toISOString()
  });
  
  // If editing, replace existing
  const idx = observations.findIndex(o => o.ID === obsId);
  if (idx !== -1) {
    observations[idx] = record;
  } else {
    observations.push(record);
  }
  
  await updateProjectDoc(projectId, { observations });
  return record;
}

// Delete an observation
export async function fbDeleteObservation(projectId, obsId) {
  const proj = await getProjectDoc(projectId);
  const observations = (proj.observations || []).filter(o => o.ID !== obsId);
  await updateProjectDoc(projectId, { observations });
  return { success: true, ID: obsId };
}

// Bulk fetch compatibility layer (translates flat observations into structured map for map/charts)
export async function fbGetLargeScaleData(projectId) {
  const proj = await getProjectDoc(projectId);
  const observations = proj.observations || [];

  // Compute sectors dynamically
  const sectorsMap = {};
  observations.forEach(o => {
    if (!o.SectorCode) return;
    sectorsMap[o.SectorCode] = {
      ID: o.SectorCode,
      Name: o.SectorName || o.SectorCode,
      Code: o.SectorCode,
      Dosage: o.Dosage,
      ApplicationTiming: o.ApplicationTiming
    };
  });
  const sectors = Object.values(sectorsMap);

  // Compute quadrants and visits maps dynamically
  const quadrantsMap = {};
  const visitsMap = {};
  
  observations.forEach(o => {
    const qId = `${o.SectorCode || 'SEC'}-${o.QuadrantCode || 'Q01'}`;
    
    if (!quadrantsMap[qId]) {
      quadrantsMap[qId] = {
        ID: qId,
        Code: o.QuadrantCode,
        sectorId: o.SectorCode,
        Lat: o.Lat,
        Lon: o.Lon,
        Replication: o.Replication,
        PlotNumber: o.PlotNumber,
        SoilPH: o.SoilPH,
        SoilClay: o.SoilClay,
        SoilSand: o.SoilSand,
        SoilOC: o.SoilOC,
        SoilTexture: o.SoilTexture,
        Notes: o.notes
      };
    }
    
    if (!visitsMap[qId]) {
      visitsMap[qId] = [];
    }
    
    visitsMap[qId].push({
      ID: o.ID,
      daa: Number(o.daa),
      date: o.date,
      weatherTemp: o.weatherTemp,
      weatherHumidity: o.weatherHumidity,
      weatherWind: o.weatherWind,
      weatherRain: o.weatherRain,
      cropPhytotoxicity: Number(o.cropPhytotoxicity || 0),
      weedObservations: o.weedObservations || [],
      photos: o.photos || [],
      weedGrowthStage: o.weedGrowthStage,
      overallWeedGrowthStage: o.overallWeedGrowthStage,
      yieldValue: o.yieldValue,
      conclusion: o.conclusion,
      notes: o.notes
    });
  });

  // Nest visits in quadrant objects for structured responses
  const quadrantsList = Object.values(quadrantsMap);
  const finalQuadrantsMap = {};
  
  sectors.forEach(sector => {
    const sectorQuads = quadrantsList.filter(q => q.sectorId === sector.ID);
    const quadsWithVisits = sectorQuads.map(quad => {
      const quadVisits = (visitsMap[quad.ID] || []).sort((a, b) => a.daa - b.daa);
      return { ...quad, visits: quadVisits };
    });
    finalQuadrantsMap[sector.ID] = quadsWithVisits;
  });

  return {
    sectors,
    quadrantsMap: finalQuadrantsMap,
    observations
  };
}

// Backward compatibility exports
export async function fbGetSectors(projectId) {
  const data = await fbGetLargeScaleData(projectId);
  return data.sectors;
}
export async function fbAddSector(projectId, sectorData, userId) {
  return { success: true };
}
export async function fbDeleteSector(projectId, sectorId) {
  return { success: true };
}
export async function fbGetQuadrants(projectId, sectorId) {
  const data = await fbGetLargeScaleData(projectId);
  return data.quadrantsMap[sectorId] || [];
}
export async function fbAddQuadrant(projectId, sectorId, quadrantData, userId) {
  return { success: true };
}
export async function fbDeleteQuadrant(projectId, sectorId, quadrantId) {
  return { success: true };
}
export async function fbGetVisits(projectId, sectorId, quadrantId) {
  return [];
}
export async function fbAddVisit(projectId, sectorId, quadrantId, visitData, userId) {
  return { success: true };
}
export async function fbDeleteVisit(projectId, sectorId, quadrantId, visitId) {
  return { success: true };
}
