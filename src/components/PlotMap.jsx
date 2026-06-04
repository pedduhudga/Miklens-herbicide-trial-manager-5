/**
 * Plot Map Component
 * Interactive GPS mapping with satellite imagery and auto-plot generation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { 
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
} from '../services/mappingService.js';
import { 
  MapPin, Crosshair, Download, Layers, 
  Navigation, Grid3x3, Ruler, Copy, CheckCircle,
  AlertTriangle, RefreshCw, Satellite, Map as MapIcon
} from 'lucide-react';

// Leaflet is loaded from CDN in index.html
const L = window.L;

export default function PlotMap({ projectId, onClose }) {
  const { state } = useAppState();
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const plotsLayerRef = useRef(null);
  const watchIdRef = useRef(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gpsPosition, setGpsPosition] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [plots, setPlots] = useState([]);
  const [tileProvider, setTileProvider] = useState('satellite');
  const [showSetup, setShowSetup] = useState(true);
  const [config, setConfig] = useState({
    width: DEFAULT_PLOT_SIZE.width,
    length: DEFAULT_PLOT_SIZE.length,
    buffer: DEFAULT_PLOT_SIZE.buffer,
    bearing: 0,
    useRCBD: true,
    manualCenter: null
  });
  const [copied, setCopied] = useState(false);

  // Get project trials
  const projectTrials = state.trials?.filter(t => t.ProjectID === projectId) || [];
  const project = state.projects?.find(p => p.ID === projectId);

  // Initialize map
  useEffect(() => {
    if (!L || !mapRef.current) return;
    
    // Default center (can be updated)
    const defaultCenter = [20.5937, 78.9629]; // India center
    
    leafletMapRef.current = L.map(mapRef.current).setView(defaultCenter, 5);
    
    // Add tile layer
    updateTileLayer(tileProvider);
    
    // Add scale control
    L.control.scale({ metric: true, imperial: false }).addTo(leafletMapRef.current);
    
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Update tile layer when provider changes
  useEffect(() => {
    if (!leafletMapRef.current) return;
    updateTileLayer(tileProvider);
  }, [tileProvider]);

  const updateTileLayer = (provider) => {
    if (!leafletMapRef.current) return;
    
    const providerConfig = TILE_PROVIDERS[provider];
    
    // Remove existing tile layers
    leafletMapRef.current.eachLayer(layer => {
      if (layer instanceof L.TileLayer) {
        leafletMapRef.current.removeLayer(layer);
      }
    });
    
    // Add new tile layer
    L.tileLayer(providerConfig.url, {
      attribution: providerConfig.attribution,
      maxZoom: 22,
      maxNativeZoom: 19
    }).addTo(leafletMapRef.current);
  };

  // Get GPS position
  const handleGetGPS = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const position = await getCurrentPosition();
      setGpsPosition(position);
      setConfig(prev => ({ ...prev, manualCenter: { lat: position.lat, lon: position.lon } }));
      
      // Center map on position
      if (leafletMapRef.current) {
        leafletMapRef.current.setView([position.lat, position.lon], 18);
        
        // Add marker
        L.marker([position.lat, position.lon])
          .addTo(leafletMapRef.current)
          .bindPopup('GPS Position (Accuracy: ' + Math.round(position.accuracy) + 'm)')
          .openPopup();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Toggle GPS tracking
  const toggleTracking = useCallback(() => {
    if (isTracking) {
      if (watchIdRef.current !== null) {
        clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
    } else {
      setIsTracking(true);
      watchIdRef.current = watchPosition((pos) => {
        if (!pos.error) {
          setGpsPosition(pos);
          if (leafletMapRef.current) {
            leafletMapRef.current.setView([pos.lat, pos.lon], 18);
          }
        }
      });
    }
  }, [isTracking]);

  // Generate plots on map
  const generatePlots = useCallback(() => {
    if (!config.manualCenter || projectTrials.length === 0) return;
    
    setLoading(true);
    
    let generatedPlots;
    
    if (config.useRCBD) {
      // Group by treatment
      const treatments = [...new Set(projectTrials.map(t => t.FormulationName))];
      const treatmentObjects = treatments.map((name, i) => ({
        ID: i,
        FormulationName: name,
        TreatmentNumber: i + 1
      }));
      
      // Calculate replicates
      const replicates = Math.ceil(projectTrials.length / treatments.length);
      
      generatedPlots = generateRCBDLayout(
        treatmentObjects,
        replicates,
        config.manualCenter.lat,
        config.manualCenter.lon,
        {
          width: config.width,
          length: config.length,
          buffer: config.buffer,
          bearing: config.bearing
        }
      );
    } else {
      generatedPlots = generateTrialPlots(
        projectTrials,
        config.manualCenter.lat,
        config.manualCenter.lon,
        {
          width: config.width,
          length: config.length,
          buffer: config.buffer,
          bearing: config.bearing
        }
      );
    }
    
    setPlots(generatedPlots);
    
    // Draw plots on map
    drawPlotsOnMap(generatedPlots);
    
    // Fit map to plots
    if (leafletMapRef.current && generatedPlots.length > 0) {
      const group = new L.featureGroup(
        generatedPlots.map(p => L.polygon(p.corners.map(c => [c.lat, c.lon])))
      );
      leafletMapRef.current.fitBounds(group.getBounds().pad(0.1));
    }
    
    setLoading(false);
    setShowSetup(false);
  }, [config, projectTrials]);

  // Draw plots on map
  const drawPlotsOnMap = (plotsToDraw) => {
    if (!leafletMapRef.current) return;
    
    // Clear existing plots layer
    if (plotsLayerRef.current) {
      leafletMapRef.current.removeLayer(plotsLayerRef.current);
    }
    
    plotsLayerRef.current = L.layerGroup().addTo(leafletMapRef.current);
    
    plotsToDraw.forEach(plot => {
      // Create polygon
      const polygon = L.polygon(
        plot.corners.map(c => [c.lat, c.lon]),
        {
          color: plot.isControl ? '#ef4444' : '#10b981',
          weight: 2,
          fillOpacity: 0.2,
          fillColor: plot.isControl ? '#ef4444' : '#10b981'
        }
      );
      
      // Add popup
      polygon.bindPopup(`
        <div style="font-family: system-ui; min-width: 150px;">
          <strong style="font-size: 14px;">${plot.trialName}</strong><br/>
          <span style="font-size: 12px; color: #666;">
            Plot ${plot.plotNumber}${plot.blockNumber ? ` • Block ${plot.blockNumber}` : ''}<br/>
            Area: ${plot.area} m²<br/>
            ${plot.isControl ? '<span style="color: #ef4444;">Control Plot</span>' : ''}
          </span>
        </div>
      `);
      
      // Add label
      const centerLabel = L.marker([plot.center.lat, plot.center.lon], {
        icon: L.divIcon({
          className: 'plot-label',
          html: `<div style="
            background: rgba(255,255,255,0.9);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          ">${plot.plotNumber}</div>`,
          iconSize: [30, 20],
          iconAnchor: [15, 10]
        })
      });
      
      polygon.addTo(plotsLayerRef.current);
      centerLabel.addTo(plotsLayerRef.current);
    });
  };

  // Export plots
  const handleExport = (format) => {
    if (plots.length === 0) return;
    
    let content, filename, mimeType;
    
    if (format === 'geojson') {
      content = JSON.stringify(exportToGeoJSON(plots, project?.Name), null, 2);
      filename = `${project?.Name || 'plots'}.geojson`;
      mimeType = 'application/geo+json';
    } else if (format === 'kml') {
      content = exportToKML(plots, project?.Name);
      filename = `${project?.Name || 'plots'}.kml`;
      mimeType = 'application/vnd.google-earth.kml+xml';
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy coordinates to clipboard
  const copyCoordinates = () => {
    if (gpsPosition) {
      const text = `${gpsPosition.lat.toFixed(6)}, ${gpsPosition.lon.toFixed(6)}`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Satellite className="w-6 h-6" />
            <div>
              <h3 className="font-bold text-lg">GPS Plot Mapping</h3>
              <p className="text-emerald-100 text-sm">{project?.Name || 'Project'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition">
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-80 bg-slate-50 border-r border-slate-200 flex flex-col overflow-y-auto">
            {/* GPS Status */}
            <div className="p-4 border-b border-slate-200">
              <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> GPS Position
              </h4>
              
              {gpsPosition ? (
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <div className="text-sm space-y-1">
                    <p><span className="text-slate-500">Lat:</span> {gpsPosition.lat.toFixed(6)}°</p>
                    <p><span className="text-slate-500">Lon:</span> {gpsPosition.lon.toFixed(6)}°</p>
                    <p><span className="text-slate-500">Accuracy:</span> ±{Math.round(gpsPosition.accuracy)}m</p>
                  </div>
                  <button
                    onClick={copyCoordinates}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-sm transition"
                  >
                    {copied ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy Coordinates'}
                  </button>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500 text-sm">
                  <Crosshair className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  No GPS position
                </div>
              )}
              
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleGetGPS}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <Crosshair className="w-4 h-4" />
                  Get GPS
                </button>
                <button
                  onClick={toggleTracking}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isTracking 
                      ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  <Navigation className={`w-4 h-4 ${isTracking ? 'animate-pulse' : ''}`} />
                  {isTracking ? 'Stop' : 'Track'}
                </button>
              </div>
              
              {error && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Plot Configuration */}
            {showSetup ? (
              <div className="p-4 border-b border-slate-200">
                <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Grid3x3 className="w-4 h-4" /> Plot Setup
                </h4>
                
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500">Width (m)</label>
                      <input
                        type="number"
                        value={config.width}
                        onChange={e => setConfig(p => ({ ...p, width: parseFloat(e.target.value) || 10 }))}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Length (m)</label>
                      <input
                        type="number"
                        value={config.length}
                        onChange={e => setConfig(p => ({ ...p, length: parseFloat(e.target.value) || 20 }))}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-xs text-slate-500">Buffer (m)</label>
                    <input
                      type="number"
                      value={config.buffer}
                      onChange={e => setConfig(p => ({ ...p, buffer: parseFloat(e.target.value) || 2 }))}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs text-slate-500">Bearing (°)</label>
                    <input
                      type="number"
                      value={config.bearing}
                      onChange={e => setConfig(p => ({ ...p, bearing: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                      placeholder="0 = North"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="useRCBD"
                      checked={config.useRCBD}
                      onChange={e => setConfig(p => ({ ...p, useRCBD: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <label htmlFor="useRCBD" className="text-sm text-slate-700">
                      Use RCBD Layout
                    </label>
                  </div>
                </div>
                
                <button
                  onClick={generatePlots}
                  disabled={!config.manualCenter || projectTrials.length === 0 || loading}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Grid3x3 className="w-4 h-4" />}
                  Generate {projectTrials.length} Plots
                </button>
                
                {projectTrials.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600 text-center">
                    No trials found for this project
                  </p>
                )}
              </div>
            ) : (
              <div className="p-4 border-b border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-slate-700">{plots.length} Plots Generated</h4>
                  <button
                    onClick={() => setShowSetup(true)}
                    className="text-xs text-emerald-600 hover:text-emerald-700"
                  >
                    Edit Setup
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleExport('geojson')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm transition"
                  >
                    <Download className="w-4 h-4" />
                    GeoJSON
                  </button>
                  <button
                    onClick={() => handleExport('kml')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm transition"
                  >
                    <Download className="w-4 h-4" />
                    KML
                  </button>
                </div>
              </div>
            )}

            {/* Map Layers */}
            <div className="p-4">
              <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4" /> Map Layer
              </h4>
              <div className="space-y-1">
                {Object.entries(TILE_PROVIDERS).map(([key, provider]) => (
                  <button
                    key={key}
                    onClick={() => setTileProvider(key)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                      tileProvider === key
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {key === 'satellite' ? <Satellite className="w-4 h-4" /> : <MapIcon className="w-4 h-4" />}
                    {provider.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Map Container */}
          <div className="flex-1 relative">
            <div ref={mapRef} className="absolute inset-0" />
            
            {/* Map Overlay Info */}
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-3 py-2 rounded-lg shadow-md text-xs text-slate-600">
              <p className="font-medium">{TILE_PROVIDERS[tileProvider].name}</p>
              {gpsPosition && <p>GPS Accuracy: ±{Math.round(gpsPosition.accuracy)}m</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
