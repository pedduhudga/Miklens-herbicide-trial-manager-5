/**
 * GPS Mapping Service
 * Handles plot generation, GPS coordinates, and satellite imagery integration
 */

import { safeJsonParse } from '../utils/helpers.js';

// Default plot dimensions (in meters)
export const DEFAULT_PLOT_SIZE = {
  width: 10,   // 10 meters
  length: 20, // 20 meters
  buffer: 2     // 2 meter buffer between plots
};

// Satellite tile providers
export const TILE_PROVIDERS = {
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri World Imagery'
  },
  openstreetmap: {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors'
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'OpenTopoMap'
  }
};

/**
 * Convert degrees to radians
 */
export function toRad(deg) {
  return deg * Math.PI / 180;
}

/**
 * Convert radians to degrees
 */
export function toDeg(rad) {
  return rad * 180 / Math.PI;
}

/**
 * Calculate destination point given distance and bearing from start point
 */
export function calculateDestinationPoint(lat, lon, distance, bearing) {
  const R = 6371000; // Earth's radius in meters
  const d = distance; // Distance in meters
  
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const brng = toRad(bearing);
  
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d / R) +
    Math.cos(lat1) * Math.sin(d / R) * Math.cos(brng)
  );
  
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(d / R) * Math.cos(lat1),
    Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2)
  );
  
  return {
    lat: toDeg(lat2),
    lon: toDeg(lon2)
  };
}

/**
 * Calculate distance between two points in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Calculate bounding box from array of coordinates
 */
export function calculateBoundingBox(coordinates) {
  if (!coordinates || coordinates.length === 0) return null;
  
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  
  coordinates.forEach(coord => {
    const [lat, lon] = coord;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  });
  
  return {
    minLat, maxLat, minLon, maxLon,
    center: {
      lat: (minLat + maxLat) / 2,
      lon: (minLon + maxLon) / 2
    }
  };
}

/**
 * Generate plot coordinates from center point
 */
export function generatePlotFromCenter(centerLat, centerLon, width, length, bearing = 0) {
  const halfWidth = width / 2;
  const halfLength = length / 2;
  
  // Calculate corners
  // bearing + 0 = forward direction
  // bearing + 90 = right
  // bearing + 180 = backward
  // bearing + 270 = left
  
  const corners = [
    // Front-left
    calculateDestinationPoint(
      calculateDestinationPoint(centerLat, centerLon, halfLength, bearing).lat,
      calculateDestinationPoint(centerLat, centerLon, halfLength, bearing).lon,
      halfWidth,
      bearing + 90
    ),
    // Front-right
    calculateDestinationPoint(
      calculateDestinationPoint(centerLat, centerLon, halfLength, bearing).lat,
      calculateDestinationPoint(centerLat, centerLon, halfLength, bearing).lon,
      halfWidth,
      bearing - 90
    ),
    // Back-right
    calculateDestinationPoint(
      calculateDestinationPoint(centerLat, centerLon, halfLength, bearing + 180).lat,
      calculateDestinationPoint(centerLat, centerLon, halfLength, bearing + 180).lon,
      halfWidth,
      bearing - 90
    ),
    // Back-left
    calculateDestinationPoint(
      calculateDestinationPoint(centerLat, centerLon, halfLength, bearing + 180).lat,
      calculateDestinationPoint(centerLat, centerLon, halfLength, bearing + 180).lon,
      halfWidth,
      bearing + 90
    )
  ];
  
  return corners;
}

/**
 * Generate plot layout for multiple treatments
 */
export function generateTrialPlots(projectTrials, startLat, startLon, options = {}) {
  const {
    width = DEFAULT_PLOT_SIZE.width,
    length = DEFAULT_PLOT_SIZE.length,
    buffer = DEFAULT_PLOT_SIZE.buffer,
    rows = null, // auto-calculate if null
    bearing = 0  // degrees, 0 = North
  } = options;
  
  if (!projectTrials || projectTrials.length === 0) return [];
  
  const numPlots = projectTrials.length;
  const numRows = rows || Math.ceil(Math.sqrt(numPlots));
  const numCols = Math.ceil(numPlots / numRows);
  
  const plots = [];
  let plotIndex = 0;
  
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      if (plotIndex >= numPlots) break;
      
      const trial = projectTrials[plotIndex];
      
      // Calculate offset from start point
      const rowOffset = row * (length + buffer);
      const colOffset = col * (width + buffer);
      
      // Calculate center point for this plot
      const rowPoint = calculateDestinationPoint(startLat, startLon, rowOffset, bearing + 180);
      const colPoint = calculateDestinationPoint(rowPoint.lat, rowPoint.lon, colOffset, bearing + 90);
      
      const center = {
        lat: colPoint.lat,
        lon: colPoint.lon
      };
      
      // Generate plot corners
      const corners = generatePlotFromCenter(center.lat, center.lon, width, length, bearing);
      
      plots.push({
        trialId: trial.ID,
        trialName: trial.FormulationName || `Plot ${plotIndex + 1}`,
        plotNumber: plotIndex + 1,
        row: row + 1,
        col: col + 1,
        center,
        corners,
        dimensions: { width, length, buffer },
        area: width * length,
        treatment: trial
      });
      
      plotIndex++;
    }
  }
  
  return plots;
}

/**
 * Generate RCBD (Randomized Complete Block Design) layout
 */
export function generateRCBDLayout(treatments, replicates, startLat, startLon, options = {}) {
  const {
    width = DEFAULT_PLOT_SIZE.width,
    length = DEFAULT_PLOT_SIZE.length,
    buffer = DEFAULT_PLOT_SIZE.buffer,
    bearing = 0
  } = options;
  
  // Randomize treatments within each block
  const blocks = [];
  for (let r = 0; r < replicates; r++) {
    const blockTreatments = [...treatments].sort(() => Math.random() - 0.5);
    blocks.push({
      blockNumber: r + 1,
      treatments: blockTreatments.map((t, i) => ({
        ...t,
        plotNumber: r * treatments.length + i + 1
      }))
    });
  }
  
  // Generate coordinates for all plots
  const plots = [];
  const plotsPerBlock = treatments.length;
  
  for (let r = 0; r < replicates; r++) {
    for (let t = 0; t < plotsPerBlock; t++) {
      const treatment = blocks[r].treatments[t];
      
      // Calculate position (block runs perpendicular to bearing, plots within block run parallel)
      const blockOffset = r * (width * plotsPerBlock + plotsPerBlock * buffer + buffer * 2);
      const plotOffset = t * (length + buffer);
      
      const blockPoint = calculateDestinationPoint(startLat, startLon, blockOffset, bearing + 90);
      const plotPoint = calculateDestinationPoint(blockPoint.lat, blockPoint.lon, plotOffset, bearing);
      
      const center = {
        lat: plotPoint.lat,
        lon: plotPoint.lon
      };
      
      const corners = generatePlotFromCenter(center.lat, center.lon, width, length, bearing);
      
      plots.push({
        trialId: treatment.ID,
        trialName: treatment.FormulationName || `Treatment ${treatment.TreatmentNumber || t + 1}`,
        plotNumber: treatment.plotNumber,
        blockNumber: r + 1,
        position: t + 1,
        center,
        corners,
        dimensions: { width, length, buffer },
        area: width * length,
        treatment,
        isControl: treatment.IsControl
      });
    }
  }
  
  return plots;
}

/**
 * Get GPS position using browser Geolocation API
 */
export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp
        });
      },
      (error) => {
        reject(new Error(`GPS Error: ${error.message} (Code: ${error.code})`));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
        ...options
      }
    );
  });
}

/**
 * Watch GPS position changes
 */
export function watchPosition(callback, options = {}) {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by this browser');
  }
  
  return navigator.geolocation.watchPosition(
    (position) => {
      callback({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: position.timestamp
      });
    },
    (error) => {
      callback({ error: error.message, code: error.code });
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 10000,
      ...options
    }
  );
}

/**
 * Stop watching GPS position
 */
export function clearWatch(watchId) {
  navigator.geolocation.clearWatch(watchId);
}

/**
 * Parse coordinates from GPS string formats
 */
export function parseCoordinates(input) {
  // Handle various formats:
  // "12.345, 67.890"
  // "12.345,67.890"
  // "12°20'42.0"N 76°34'12.0"E"
  // "12.345N 67.890E"
  
  if (typeof input !== 'string') return null;
  
  // Try decimal format
  const decimalMatch = input.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (decimalMatch) {
    const lat = parseFloat(decimalMatch[1]);
    const lon = parseFloat(decimalMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon };
    }
  }
  
  // Try DMS format (degrees, minutes, seconds)
  const dmsMatch = input.match(/(\d+)°\s*(\d+)'\s*([\d.]+)"?\s*([NnSs])\s*,?\s*(\d+)°\s*(\d+)'\s*([\d.]+)"?\s*([EeWw])/);
  if (dmsMatch) {
    const latDeg = parseInt(dmsMatch[1]);
    const latMin = parseInt(dmsMatch[2]);
    const latSec = parseFloat(dmsMatch[3]);
    const latDir = dmsMatch[4].toUpperCase();
    
    const lonDeg = parseInt(dmsMatch[5]);
    const lonMin = parseInt(dmsMatch[6]);
    const lonSec = parseFloat(dmsMatch[7]);
    const lonDir = dmsMatch[8].toUpperCase();
    
    let lat = latDeg + latMin / 60 + latSec / 3600;
    let lon = lonDeg + lonMin / 60 + lonSec / 3600;
    
    if (latDir === 'S') lat = -lat;
    if (lonDir === 'W') lon = -lon;
    
    return { lat, lon };
  }
  
  return null;
}

/**
 * Export plot coordinates to GeoJSON format
 */
export function exportToGeoJSON(plots, projectName = 'Trial Plots') {
  const features = plots.map(plot => ({
    type: 'Feature',
    properties: {
      name: plot.trialName,
      plotNumber: plot.plotNumber,
      blockNumber: plot.blockNumber,
      treatment: plot.treatment?.FormulationName,
      area: plot.area,
      dimensions: plot.dimensions
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [plot.corners[0].lon, plot.corners[0].lat],
        [plot.corners[1].lon, plot.corners[1].lat],
        [plot.corners[2].lon, plot.corners[2].lat],
        [plot.corners[3].lon, plot.corners[3].lat],
        [plot.corners[0].lon, plot.corners[0].lat]
      ]]
    }
  }));
  
  return {
    type: 'FeatureCollection',
    properties: {
      name: projectName,
      generatedAt: new Date().toISOString(),
      totalPlots: plots.length
    },
    features
  };
}

/**
 * Export to KML format for Google Earth
 */
export function exportToKML(plots, projectName = 'Trial Plots') {
  const placemarks = plots.map(plot => `
    <Placemark>
      <name>${plot.trialName}</name>
      <description>
        Plot ${plot.plotNumber}${plot.blockNumber ? `, Block ${plot.blockNumber}` : ''}
        Treatment: ${plot.treatment?.FormulationName || 'Unknown'}
        Area: ${plot.area} m²
      </description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${plot.corners.map(c => `${c.lon},${c.lat},0`).join(' ')}
              ${plot.corners[0].lon},${plot.corners[0].lat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  `).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${projectName}</name>
    ${placemarks}
  </Document>
</kml>`;
}

// Window exports
if (typeof window !== 'undefined') {
  window.mappingService = {
    calculateDestinationPoint,
    calculateDistance,
    calculateBoundingBox,
    generatePlotFromCenter,
    generateTrialPlots,
    generateRCBDLayout,
    getCurrentPosition,
    watchPosition,
    clearWatch,
    parseCoordinates,
    exportToGeoJSON,
    exportToKML,
    TILE_PROVIDERS,
    DEFAULT_PLOT_SIZE
  };
}

export default {
  calculateDestinationPoint,
  calculateDistance,
  calculateBoundingBox,
  generatePlotFromCenter,
  generateTrialPlots,
  generateRCBDLayout,
  getCurrentPosition,
  watchPosition,
  clearWatch,
  parseCoordinates,
  exportToGeoJSON,
  exportToKML,
  TILE_PROVIDERS,
  DEFAULT_PLOT_SIZE
};
