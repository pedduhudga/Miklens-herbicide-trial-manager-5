import React, { useEffect, useRef, useState } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import L from 'leaflet';

const RESULT_COLORS = {
  Excellent: '#22c55e',
  Good:      '#3b82f6',
  Fair:      '#f59e0b',
  Poor:      '#ef4444',
  '':        '#94a3b8',
};

export default function FieldMap({ onMenuClick }) {
  const { state } = useAppState();
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const [colorMode, setColorMode] = useState('result');

  useEffect(() => {
    if (!containerRef.current || typeof L === 'undefined') return;

    const geoTrials = (state.trials || []).filter(t => {
      const lat = parseFloat(t.Lat);
      const lon = parseFloat(t.Lon);
      return isFinite(lat) && isFinite(lon) && lat !== 0 && lon !== 0;
    });

    // Destroy previous map instance
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    if (geoTrials.length === 0) return;

    const avgLat = geoTrials.reduce((s, t) => s + parseFloat(t.Lat), 0) / geoTrials.length;
    const avgLon = geoTrials.reduce((s, t) => s + parseFloat(t.Lon), 0) / geoTrials.length;

    const map = L.map(containerRef.current).setView([avgLat, avgLon], 12);
    mapRef.current = map;

    const googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps',
    });
    const googleStandard = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps',
    });
    googleHybrid.addTo(map);
    L.control.layers({ 'Satellite': googleHybrid, 'Map': googleStandard }).addTo(map);

    geoTrials.forEach(trial => {
      const lat = parseFloat(trial.Lat);
      const lon = parseFloat(trial.Lon);
      const color = RESULT_COLORS[trial.Result || ''] || RESULT_COLORS[''];

      const circle = L.circleMarker([lat, lon], {
        radius: 12,
        fillColor: color,
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        fillOpacity: 0.9,
      }).addTo(map);

      circle.bindPopup(`
        <div style="min-width:180px;font-family:sans-serif;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${trial.FormulationName || 'Unknown'}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:6px;">${trial.Date ? new Date(trial.Date).toLocaleDateString() : ''} · ${trial.Location || ''}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
            <span style="color:#64748b;">Result:</span><span style="font-weight:600;">${trial.Result || 'N/A'}</span>
            <span style="color:#64748b;">Dosage:</span><span>${trial.Dosage || 'N/A'}</span>
          </div>
          <div style="margin-top:8px;">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" target="_blank"
               style="color:#3b82f6;font-weight:600;font-size:11px;text-decoration:none;display:block;margin-bottom:4px;">
              &#9654; Get Directions (Google Maps)
            </a>
          </div>
        </div>
      `);
    });

    const bounds = L.latLngBounds(geoTrials.map(t => [parseFloat(t.Lat), parseFloat(t.Lon)]));
    map.fitBounds(bounds.pad(0.1));

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [state.trials, colorMode]);

  const geoTrials = (state.trials || []).filter(t => {
    const lat = parseFloat(t.Lat);
    const lon = parseFloat(t.Lon);
    return isFinite(lat) && isFinite(lon) && lat !== 0 && lon !== 0;
  });
  const geoTrialsCount = geoTrials.length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TopBar title="Field Map" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-hidden p-6 flex flex-col">
        <div className="mb-4 flex flex-wrap justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 gap-3">
          <div>
            <h3 className="font-bold text-slate-800">Geospatial Distribution</h3>
            <p className="text-sm text-slate-500">
              {geoTrialsCount} of {(state.trials || []).length} trials have GPS data.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              Color by Result:
              <div className="flex items-center gap-1">
                {Object.entries(RESULT_COLORS).filter(([k]) => k).map(([result, color]) => (
                  <span key={result} className="flex items-center gap-1 text-xs text-slate-600">
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color }} />
                    {result}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden relative" style={{ minHeight: '400px' }}>
          {geoTrialsCount > 0 ? (
            <div ref={containerRef} className="w-full h-full" style={{ zIndex: 10 }} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
              <p className="font-semibold text-lg">No GPS-tagged trials found.</p>
              <p className="text-sm">Add GPS coordinates when creating trials to see them on the map.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
