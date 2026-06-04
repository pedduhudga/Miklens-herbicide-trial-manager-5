import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addProject } from '../services/dataLayer.js';
import {
  fbGetLargeScaleData,
  fbAddObservation,
  fbDeleteObservation
} from '../services/largeScaleService.js';
import {
  Plus, Trash2, MapPin, Calendar, Camera, Info, Sparkles, X,
  Compass, Map as MapIcon, RefreshCw, Layers, Thermometer, Wind, Droplets, CloudRain,
  Eye, CheckCircle, ChevronRight, BarChart2, Edit3, ArrowLeft
} from 'lucide-react';
import { analyzePhoto, identifyWeedFromPhoto } from '../services/multiProviderAI.js';
import { uploadPhoto } from '../services/dataLayer.js';

const L = window.L;

const emptyObsForm = () => ({
  SectorCode: '',
  SectorName: '',
  QuadrantCode: '',
  Lat: '',
  Lon: '',
  FormulationID: '',
  Dosage: '',
  ApplicationTiming: 'POST',
  Replication: 'R1',
  PlotNumber: '',
  SoilPH: '',
  SoilClay: '',
  SoilSand: '',
  SoilOC: '',
  SoilTexture: '',
  daa: '',
  date: new Date().toISOString().split('T')[0],
  weatherTemp: '',
  weatherHumidity: '',
  weatherWind: '',
  weatherRain: '',
  cropPhytotoxicity: 0,
  weedGrowthStage: 'Vegetative',
  overallWeedGrowthStage: '',
  yieldValue: '',
  notes: '',
  conclusion: '',
  weedObservations: [],
  photoBase64: '',
  photoDirection: 'North'
});

export default function LargeScaleTrials({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  
  // Projects of Design = 'LargeScale'
  const macroProjects = useMemo(() => {
    return (state.projects || []).filter(p => p.Design === 'LargeScale');
  }, [state.projects]);

  const [activeProjectId, setActiveProjectId] = useState('');
  const [observations, setObservations] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [quadrants, setQuadrants] = useState([]);
  const [visitsMap, setVisitsMap] = useState({});
  const [loading, setLoading] = useState(false);

  // Active view details
  const [selectedObsId, setSelectedObsId] = useState('');
  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'chart'

  // Modals state
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isObsModalOpen, setIsObsModalOpen] = useState(false);
  const [editingObs, setEditingObs] = useState(null);

  // Forms
  const [projectForm, setProjectForm] = useState({ Name: '', Crop: '', Location: '', Investigator: '', TargetWeeds: '', GPSBounds: '' });
  const [obsForm, setObsForm] = useState(emptyObsForm());

  // Chart state
  const [selectedWeedForChart, setSelectedWeedForChart] = useState('Total');

  // Leaflet map refs
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersGroupRef = useRef(null);
  const [gpsFetching, setGpsFetching] = useState(false);

  // Load project observations
  const loadProjectData = async () => {
    if (!activeProjectId) {
      setObservations([]);
      setSectors([]);
      setQuadrants([]);
      setVisitsMap({});
      return;
    }
    setLoading(true);
    try {
      const data = await fbGetLargeScaleData(activeProjectId);
      setObservations(data.observations || []);
      setSectors(data.sectors || []);
      
      // Flatten quadrants for map plotting
      const allQuads = [];
      const allVisits = {};
      Object.entries(data.quadrantsMap || {}).forEach(([sectorId, quadsList]) => {
        quadsList.forEach(q => {
          allQuads.push({ ...q, sectorId });
          allVisits[q.ID] = q.visits || [];
        });
      });
      setQuadrants(allQuads);
      setVisitsMap(allVisits);
    } catch (err) {
      console.error('Failed to load project details', err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to load project details.', type: 'error' } }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjectData();
    setSelectedObsId('');
  }, [activeProjectId]);

  // Leaflet map initializer (Esri World Imagery satellite map)
  useEffect(() => {
    if (!L || !mapContainerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView([20.5937, 78.9629], 5);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 20
      }).addTo(mapRef.current);

      markersGroupRef.current = L.layerGroup().addTo(mapRef.current);

      // Force boundary calculation to fix blank gray canvas issues
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 500);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map markers when quadrants change
  useEffect(() => {
    if (!mapRef.current || !markersGroupRef.current) return;

    markersGroupRef.current.clearLayers();
    const coords = [];

    quadrants.forEach(q => {
      const lat = parseFloat(q.Lat);
      const lon = parseFloat(q.Lon);
      if (isNaN(lat) || isNaN(lon)) return;

      coords.push([lat, lon]);
      const sectorName = sectors.find(s => s.ID === q.sectorId)?.Name || q.sectorId;

      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'custom-quad-pin',
          html: `<div class="w-8 h-8 rounded-full bg-emerald-600 border-2 border-white flex items-center justify-center text-white font-bold text-xs shadow-lg">${q.ID.split('-').pop() || 'Q'}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      });

      marker.bindPopup(`
        <div class="p-2 font-sans text-xs">
          <h4 class="font-bold text-slate-800">${q.ID}</h4>
          <p class="text-slate-500">Zone: ${sectorName}</p>
          <p class="text-slate-500">${lat.toFixed(6)}, ${lon.toFixed(6)}</p>
          <button onclick="window.dispatchEvent(new CustomEvent('app:select-quad', {detail: '${q.ID}'}))" class="mt-1.5 px-2 py-0.5 bg-emerald-700 text-white font-bold rounded hover:bg-emerald-800 text-[10px] w-full text-center">Inspect Stake</button>
        </div>
      `);
      
      marker.addTo(markersGroupRef.current);
    });

    if (coords.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(coords).pad(0.2));
    }
  }, [quadrants, sectors]);

  // Hook map select events
  useEffect(() => {
    const handleSelectQuad = (e) => {
      const quadId = e.detail;
      const matched = observations.find(o => `${o.SectorCode || 'SEC'}-${o.QuadrantCode || 'Q01'}` === quadId);
      if (matched) {
        setSelectedObsId(matched.ID);
      }
    };
    window.addEventListener('app:select-quad', handleSelectQuad);
    return () => window.removeEventListener('app:select-quad', handleSelectQuad);
  }, [observations]);

  // GPS position tracking
  const handleGetGPS = () => {
    if (!navigator.geolocation) return;
    setGpsFetching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setObsForm(prev => ({ ...prev, Lat: latitude.toFixed(6), Lon: longitude.toFixed(6) }));
        setGpsFetching(false);
        if (mapRef.current) {
          mapRef.current.setView([latitude, longitude], 18);
        }
      },
      () => {
        setGpsFetching(false);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Unable to retrieve location.', type: 'error' } }));
      },
      { enableHighAccuracy: true }
    );
  };

  // Weather fetch helper
  const fetchWeather = async () => {
    const lat = parseFloat(obsForm.Lat);
    const lon = parseFloat(obsForm.Lon);
    if (isNaN(lat) || isNaN(lon)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Enter coordinates first to fetch weather.', type: 'error' } }));
      return;
    }

    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`);
      const d = await res.json();
      const c = d.current;
      if (c) {
        setObsForm(prev => ({
          ...prev,
          weatherTemp: c.temperature_2m?.toString() || '',
          weatherHumidity: c.relative_humidity_2m?.toString() || '',
          weatherWind: c.wind_speed_10m?.toString() || '',
          weatherRain: c.precipitation?.toString() || ''
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather parameters synced!', type: 'success' } }));
      }
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather sync failed.', type: 'error' } }));
    }
  };

  const handleSaveProject = async (e) => {
    e.preventDefault();
    const payload = {
      ...projectForm,
      Design: 'LargeScale',
      Status: 'Active',
      CreatedAt: new Date().toISOString()
    };

    try {
      const res = await addProject(payload, getAppState);
      const updatedList = [...(state.projects || []), res];
      updateState({ projects: updatedList });
      setActiveProjectId(res.ID);
      setIsProjectModalOpen(false);
      setProjectForm({ Name: '', Crop: '', Location: '', Investigator: '', TargetWeeds: '', GPSBounds: '' });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Large-scale project created!', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to create project.', type: 'error' } }));
    }
  };

  // Image Downsampling (1920px max dimension, 0.95 quality)
  const handlePhotoCapture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1920;
        let w = img.width;
        let h = img.height;

        if (w > maxDim || h > maxDim) {
          const ratio = maxDim / Math.max(w, h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.95);
        setObsForm(prev => ({ ...prev, photoBase64: optimizedBase64 }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // AI photo analysis
  const handleAIAssist = async () => {
    if (!obsForm.photoBase64) return;
    setLoading(true);
    try {
      const aiResponse = await identifyWeedFromPhoto(obsForm.photoBase64);
      if (aiResponse && Array.isArray(aiResponse)) {
        const observationsList = aiResponse.map(weed => ({
          species: weed.name || 'Unknown',
          cover: Math.round((weed.cover || 0) * 100) || 10,
          bbch: weed.growthStage || '10'
        }));
        setObsForm(prev => ({
          ...prev,
          weedObservations: observationsList
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis successful!', type: 'success' } }));
      }
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI weed identification failed.', type: 'error' } }));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveObservation = async (e) => {
    e.preventDefault();
    if (!activeProjectId) return;
    setLoading(true);

    let photos = [];
    if (obsForm.photoBase64) {
      try {
        const fileName = `quadrant_${obsForm.SectorCode || 'SEC'}_${obsForm.QuadrantCode || 'Q01'}_${Date.now()}.jpg`;
        const uploadResult = await uploadPhoto({
          base64: obsForm.photoBase64,
          filename: fileName,
          folderName: projectForm.Name || 'Large Field Trials'
        }, getAppState);

        if (uploadResult && uploadResult.url) {
          photos.push({
            id: uploadResult.id,
            url: uploadResult.url,
            name: fileName,
            direction: obsForm.photoDirection
          });
        }
      } catch (err) {
        console.warn('Drive photo upload failed, using local caching:', err);
      }
    }

    const formulation = state.formulations?.find(f => f.ID === obsForm.FormulationID);

    const payload = {
      ...obsForm,
      ID: editingObs?.ID || `obs_${Date.now()}`,
      FormulationName: formulation?.Name || '',
      photos: photos.length > 0 ? photos : (editingObs?.photos || []),
      _updatedAt: new Date().toISOString()
    };

    // Remove temporary canvas capture string
    delete payload.photoBase64;

    try {
      await fbAddObservation(activeProjectId, payload, state.auth?.uid);
      await loadProjectData();
      setIsObsModalOpen(false);
      setEditingObs(null);
      setObsForm(emptyObsForm());
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Field observation logged!', type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save observation.', type: 'error' } }));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteObs = async (obsId) => {
    if (!window.confirm('Delete this observation record?')) return;
    setLoading(true);
    try {
      await fbDeleteObservation(activeProjectId, obsId);
      await loadProjectData();
      setSelectedObsId('');
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Observation record deleted.', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete observation.', type: 'error' } }));
    } finally {
      setLoading(false);
    }
  };

  // Comparative Efficacy Calculation
  const comparativeChartData = useMemo(() => {
    if (!activeProjectId || sectors.length === 0) return { daas: [], datasets: [] };

    // Find all distinct DAA intervals globally inside the project visits
    const daaSet = new Set();
    Object.values(visitsMap).forEach(vList => {
      vList.forEach(v => {
        if (v.daa !== undefined) daaSet.add(v.daa);
      });
    });
    const daas = Array.from(daaSet).sort((a, b) => a - b);

    // Group visits by sector & DAA to average cover %
    const datasets = sectors.map(sector => {
      const sectorQuads = quadrants.filter(q => q.sectorId === sector.ID);
      
      const values = daas.map(daa => {
        let sumCover = 0;
        let count = 0;

        sectorQuads.forEach(q => {
          const qVisits = visitsMap[q.ID] || [];
          const matchedVisit = qVisits.find(v => v.daa === daa);
          if (matchedVisit) {
            if (selectedWeedForChart === 'Total') {
              const cover = matchedVisit.weedObservations.reduce((acc, curr) => acc + (curr.cover || 0), 0);
              sumCover += cover;
              count++;
            } else {
              const weedObs = matchedVisit.weedObservations.find(wo => wo.species === selectedWeedForChart);
              if (weedObs) {
                sumCover += weedObs.cover || 0;
                count++;
              }
            }
          }
        });

        const avgCover = count > 0 ? sumCover / count : null;
        return avgCover;
      });

      return {
        label: sector.Name,
        code: sector.Code,
        data: values
      };
    });

    // Translate cover % to WCE% against the maximum sector (which serves as baseline untreated control)
    const formattedDatasets = datasets.map(ds => {
      const wceData = ds.data.map((val, idx) => {
        if (val === null) return null;
        const allValAtIdx = datasets.map(d => d.data[idx]).filter(v => v !== null && v !== undefined);
        const maxVal = allValAtIdx.length > 0 ? Math.max(...allValAtIdx) : 100;
        if (maxVal === 0) return 100;
        
        const wce = 100 * (1 - val / maxVal);
        return parseFloat(wce.toFixed(1));
      });

      return {
        ...ds,
        data: wceData
      };
    });

    return { daas, datasets: formattedDatasets };
  }, [activeProjectId, sectors, quadrants, visitsMap, selectedWeedForChart]);

  // List of distinct weeds captured across visits to populate chart selector
  const weedOptionsList = useMemo(() => {
    const list = new Set(['Total']);
    Object.values(visitsMap).forEach(vList => {
      vList.forEach(v => {
        (v.weedObservations || []).forEach(wo => {
          if (wo.species) list.add(wo.species);
        });
      });
    });
    return Array.from(list);
  }, [visitsMap]);

  const selectedObservation = useMemo(() => {
    return observations.find(o => o.ID === selectedObsId);
  }, [observations, selectedObsId]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 font-sans">
      <TopBar title="Large Field Trials" onMenuClick={onMenuClick} />

      <div className="flex-grow overflow-y-auto p-6 space-y-6">
        
        {/* Workspace Selector Bar */}
        <div className="backdrop-blur-md bg-white/70 rounded-2xl p-4 border border-white/40 shadow-sm flex flex-wrap gap-4 justify-between items-center">
          <div className="flex items-center gap-3">
            <Compass className="text-emerald-700 h-6 w-6 shrink-0" />
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-extrabold text-emerald-800">Select Project Workspace</label>
              <select
                value={activeProjectId}
                onChange={e => setActiveProjectId(e.target.value)}
                className="bg-transparent border-b border-emerald-800/20 text-slate-800 font-bold focus:outline-none focus:border-emerald-700 pr-4 text-sm"
              >
                <option value="">-- Choose Large Field Trial --</option>
                {macroProjects.map(p => <option key={p.ID} value={p.ID}>{p.Name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsProjectModalOpen(true)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Create Field Workspace
            </button>
            {activeProjectId && (
              <button
                onClick={() => {
                  setEditingObs(null);
                  setObsForm(emptyObsForm());
                  setIsObsModalOpen(true);
                }}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Log Observation Record
              </button>
            )}
          </div>
        </div>

        {activeProjectId ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left side: Maps and Timelines */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Satellite Map */}
              <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100 flex flex-col h-[420px] relative">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <span className="font-bold text-slate-700 text-sm flex items-center gap-2">
                    <MapIcon className="w-4 h-4 text-emerald-600" /> satellite GIS Quadrants Map
                  </span>
                  <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {quadrants.length} Stakes Tracked
                  </div>
                </div>
                <div ref={mapContainerRef} className="flex-1 w-full h-full bg-slate-50" />
              </div>

              {/* Comparative Efficacy Chart */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                      <BarChart2 className="w-5 h-5 text-emerald-600" /> Weed Control Efficacy (WCE%)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Timeline efficacy comparison lines plotted side-by-side per treatment sector</p>
                  </div>
                  
                  <select
                    value={selectedWeedForChart}
                    onChange={e => setSelectedWeedForChart(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border rounded-lg text-xs font-semibold focus:outline-none"
                  >
                    {weedOptionsList.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>

                {comparativeChartData.daas.length > 0 ? (
                  <div className="h-64 flex flex-col justify-between">
                    {/* SVG Line Graph */}
                    <div className="flex-1 relative">
                      <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                        {/* Horizontal Grid lines */}
                        {[0, 25, 50, 75, 100].map(yVal => {
                          const y = 200 - (yVal * 200 / 100);
                          return (
                            <line key={yVal} x1="0" y1={y} x2="500" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                          );
                        })}

                        {/* Connection Lines */}
                        {comparativeChartData.datasets.map((dataset, dsIdx) => {
                          const points = dataset.data.map((val, idx) => {
                            if (val === null) return null;
                            const x = (idx / (comparativeChartData.daas.length - 1)) * 500;
                            const y = 200 - (val * 200 / 100);
                            return `${x},${y}`;
                          }).filter(Boolean).join(' ');

                          const colors = ['#059669', '#3b82f6', '#d97706', '#8b5cf6', '#ec4899'];
                          return (
                            <polyline
                              key={dataset.label}
                              fill="none"
                              stroke={colors[dsIdx % colors.length]}
                              strokeWidth="3"
                              points={points}
                            />
                          );
                        })}
                      </svg>
                    </div>

                    {/* Chart X-Axis Labels */}
                    <div className="flex justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {comparativeChartData.daas.map(daa => (
                        <span key={daa}>DAA {daa}</span>
                      ))}
                    </div>

                    {/* Chart Legend */}
                    <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-100">
                      {comparativeChartData.datasets.map((dataset, dsIdx) => {
                        const colors = ['#059669', '#3b82f6', '#d97706', '#8b5cf6', '#ec4899'];
                        return (
                          <div key={dataset.label} className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[dsIdx % colors.length] }} />
                            <span>{dataset.label} ({dataset.code})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400 font-medium text-sm">
                    No visit data recorded yet to build timelines.
                  </div>
                )}
              </div>
            </div>

            {/* Right side: Unified Context-Aware Panel */}
            <div className="space-y-6">
              
              {selectedObservation ? (
                // Detail Card View
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <button 
                      onClick={() => setSelectedObsId('')}
                      className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to List
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingObs(selectedObservation);
                          setObsForm({
                            ...selectedObservation,
                            photoBase64: ''
                          });
                          setIsObsModalOpen(true);
                        }}
                        className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition"
                        title="Edit Record"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteObs(selectedObservation.ID)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition"
                        title="Delete Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase mb-0.5">IDENTIFICATION</span>
                      <h3 className="text-base font-bold text-slate-800">
                        {selectedObservation.SectorCode || 'Sector'} - {selectedObservation.QuadrantCode || 'Stake'}
                      </h3>
                      <p className="text-slate-500 font-semibold mt-0.5">Zone Name: {selectedObservation.SectorName || 'N/A'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block font-semibold">Treatment</span>
                        <span className="font-bold text-slate-700">{selectedObservation.FormulationName || 'Untreated Check'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block font-semibold">Dosage</span>
                        <span className="font-bold text-slate-700">{selectedObservation.Dosage || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block font-semibold">DAT/DAA</span>
                        <span className="font-bold text-emerald-800">DAA {selectedObservation.daa}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block font-semibold">Assessment Date</span>
                        <span className="font-bold text-slate-700">{selectedObservation.date}</span>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-2.5 text-[11px] text-slate-600">
                      <div><span className="font-bold">Replication:</span> {selectedObservation.Replication || 'N/A'}</div>
                      <div><span className="font-bold">Plot Number:</span> {selectedObservation.PlotNumber || 'N/A'}</div>
                      <div><span className="font-bold">Timing:</span> {selectedObservation.ApplicationTiming || 'N/A'}</div>
                      <div><span className="font-bold">GPS Coordinate:</span> {selectedObservation.Lat}, {selectedObservation.Lon}</div>
                    </div>

                    {/* Soil parameters */}
                    {(selectedObservation.SoilPH || selectedObservation.SoilTexture || selectedObservation.SoilClay) && (
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <span className="font-bold text-slate-700 text-[10px] uppercase block mb-1">Soil Profile</span>
                        <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                          {selectedObservation.SoilPH && <div>pH: {selectedObservation.SoilPH}</div>}
                          {selectedObservation.SoilTexture && <div>Texture: {selectedObservation.SoilTexture}</div>}
                          {selectedObservation.SoilClay && <div>Clay: {selectedObservation.SoilClay}%</div>}
                          {selectedObservation.SoilSand && <div>Sand: {selectedObservation.SoilSand}%</div>}
                          {selectedObservation.SoilOC && <div>Org Carbon: {selectedObservation.SoilOC}%</div>}
                        </div>
                      </div>
                    )}

                    {/* Weather */}
                    {(selectedObservation.weatherTemp || selectedObservation.weatherHumidity) && (
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <span className="font-bold text-slate-700 text-[10px] uppercase block mb-1">Weather at Capture</span>
                        <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                          {selectedObservation.weatherTemp && <div>Temp: {selectedObservation.weatherTemp}°C</div>}
                          {selectedObservation.weatherHumidity && <div>Humidity: {selectedObservation.weatherHumidity}%</div>}
                          {selectedObservation.weatherWind && <div>Wind: {selectedObservation.weatherWind} km/h</div>}
                          {selectedObservation.weatherRain && <div>Rain: {selectedObservation.weatherRain} mm</div>}
                        </div>
                      </div>
                    )}

                    {/* Weed Cover observations */}
                    <div className="bg-white p-3 rounded-xl border border-slate-100 space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase pb-1 border-b">
                        <span>Weed Species</span>
                        <span>Cover % (BBCH)</span>
                      </div>
                      {selectedObservation.weedObservations?.map((wo, i) => (
                        <div key={i} className="flex justify-between text-[11px] text-slate-700">
                          <span className="font-medium">{wo.species}</span>
                          <span className="font-bold">{wo.cover}% <span className="text-[9px] text-slate-400 font-normal">(BBCH {wo.bbch})</span></span>
                        </div>
                      ))}
                      {(!selectedObservation.weedObservations || selectedObservation.weedObservations.length === 0) && (
                        <div className="text-slate-400 italic text-[10px] text-center py-1">No weeds observed</div>
                      )}
                    </div>

                    {selectedObservation.photos && selectedObservation.photos.length > 0 && (
                      <div>
                        <span className="font-bold text-slate-700 text-[10px] uppercase block mb-1.5">Field Photograph</span>
                        <div className="flex flex-wrap gap-2">
                          {selectedObservation.photos.map((ph, idx) => (
                            <a key={idx} href={ph.url} target="_blank" rel="noopener noreferrer" className="relative block w-full h-32 rounded-xl overflow-hidden border">
                              <img src={ph.url} alt={ph.name} className="w-full h-full object-cover" />
                              <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[9px] text-white">
                                Camera facing: {ph.direction || 'Nadir'}
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedObservation.notes && (
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <span className="font-bold text-slate-700 text-[10px] uppercase block mb-0.5">Observation Notes</span>
                        <p className="text-[11px] text-slate-600">{selectedObservation.notes}</p>
                      </div>
                    )}

                    {selectedObservation.conclusion && (
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <span className="font-bold text-slate-700 text-[10px] uppercase block mb-0.5">Final Conclusion</span>
                        <p className="text-[11px] text-slate-600">{selectedObservation.conclusion}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Directory of Observations View
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col h-[560px]">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-600" /> Observation Visits Logs
                    </h3>
                    <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded">
                      {observations.length} Total Logs
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                    {observations.map(obs => {
                      const totalWeedCover = obs.weedObservations?.reduce((acc, curr) => acc + (curr.cover || 0), 0) || 0;
                      return (
                        <div
                          key={obs.ID}
                          onClick={() => {
                            setSelectedObsId(obs.ID);
                            // Centering on coordinates
                            const lat = parseFloat(obs.Lat);
                            const lon = parseFloat(obs.Lon);
                            if (!isNaN(lat) && !isNaN(lon) && mapRef.current) {
                              mapRef.current.setView([lat, lon], 18);
                            }
                          }}
                          className="p-3 rounded-xl border border-slate-100 hover:border-emerald-300 transition cursor-pointer flex justify-between items-center"
                        >
                          <div className="space-y-1.5 flex-1 min-w-0 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider">
                                {obs.SectorCode || 'SEC'}
                              </span>
                              <span className="font-bold text-slate-800 text-xs">Stake {obs.QuadrantCode}</span>
                              <span className="text-slate-400 text-[10px]">DAA {obs.daa}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-semibold truncate">
                              Treatment: {obs.FormulationName || 'Untreated Check'} | Timing: {obs.ApplicationTiming}
                            </div>
                            <div className="flex flex-wrap gap-2 text-[9px]">
                              <span className="text-slate-500 font-bold">Weed Cover: {totalWeedCover}%</span>
                              <span className="text-slate-500 font-bold">Injury: {obs.cropPhytotoxicity}%</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {obs.photos && obs.photos.length > 0 && (
                              <div className="w-10 h-8 rounded overflow-hidden border border-slate-200">
                                <img src={obs.photos[0].url} alt="" className="w-full h-full object-cover" />
                              </div>
                            )}
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </div>
                        </div>
                      );
                    })}

                    {observations.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 italic py-12">
                        <Calendar className="w-8 h-8 text-slate-200 mb-2" />
                        No field observations logged yet. Click "+ Log Observation Record" to start.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-24 text-center bg-white border border-slate-100 rounded-3xl shadow-sm">
            <Compass className="w-16 h-16 mx-auto text-slate-200 mb-4 animate-pulse" />
            <h3 className="font-bold text-slate-700 text-lg">No Field Workspace Selected</h3>
            <p className="text-slate-400 text-sm mt-1">Select an existing large field trial project or create a new one to begin.</p>
          </div>
        )}
      </div>

      {/* Modal: Add Project */}
      <Modal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} title="New Large Field Trial">
        <form onSubmit={handleSaveProject} className="space-y-4 font-sans text-xs">
          <div>
            <label className="block text-slate-600 font-bold mb-1">Project Name</label>
            <input
              type="text"
              required
              placeholder="e.g. 50-Acre Soy Herbicide Demo"
              value={projectForm.Name}
              onChange={e => setProjectForm(p => ({ ...p, Name: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Target Crop</label>
              <input
                type="text"
                placeholder="e.g. Soybeans"
                value={projectForm.Crop}
                onChange={e => setProjectForm(p => ({ ...p, Crop: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Location</label>
              <input
                type="text"
                placeholder="e.g. Sector 4, Farms"
                value={projectForm.Location}
                onChange={e => setProjectForm(p => ({ ...p, Location: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-slate-600 font-bold mb-1">Target Weeds (comma separated)</label>
            <input
              type="text"
              placeholder="e.g. Barnyard Grass, Crabgrass"
              value={projectForm.TargetWeeds}
              onChange={e => setProjectForm(p => ({ ...p, TargetWeeds: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-bold mb-1">Field Boundary Polygon (Coordinates string)</label>
            <textarea
              placeholder="[[lat, lon], [lat, lon]...]"
              value={projectForm.GPSBounds}
              onChange={e => setProjectForm(p => ({ ...p, GPSBounds: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none h-16"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 transition"
          >
            Create Large Scale Project
          </button>
        </form>
      </Modal>

      {/* Modal: Log Field Observation */}
      <Modal isOpen={isObsModalOpen} onClose={() => setIsObsModalOpen(false)} title={editingObs ? "Edit Field Observation" : "Log Field Observation"}>
        <form onSubmit={handleSaveObservation} className="space-y-4 font-sans text-xs max-h-[80vh] overflow-y-auto pr-1">
          
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
            <span className="font-bold text-slate-700 text-[10px] uppercase">Trial Identifiers</span>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-500 font-bold mb-1">Zone Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SEC A"
                  value={obsForm.SectorCode}
                  onChange={e => setObsForm(p => ({ ...p, SectorCode: e.target.value.toUpperCase() }))}
                  className="w-full px-2.5 py-1.5 border bg-white rounded-lg focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1">Zone Name</label>
                <input
                  type="text"
                  placeholder="e.g. West Strip"
                  value={obsForm.SectorName}
                  onChange={e => setObsForm(p => ({ ...p, SectorName: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border bg-white rounded-lg focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1">Stake / Quad ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q01"
                  value={obsForm.QuadrantCode}
                  onChange={e => setObsForm(p => ({ ...p, QuadrantCode: e.target.value.toUpperCase() }))}
                  className="w-full px-2.5 py-1.5 border bg-white rounded-lg focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Treatment / Formulation</label>
              <select
                value={obsForm.FormulationID}
                onChange={e => setObsForm(p => ({ ...p, FormulationID: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              >
                <option value="">-- Choose Formulation --</option>
                {state.formulations?.map(f => <option key={f.ID} value={f.ID}>{f.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Dosage rate</label>
              <input
                type="text"
                placeholder="e.g. 1.5 L/ha"
                value={obsForm.Dosage}
                onChange={e => setObsForm(p => ({ ...p, Dosage: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Application Timing</label>
              <select
                value={obsForm.ApplicationTiming}
                onChange={e => setObsForm(p => ({ ...p, ApplicationTiming: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              >
                <option value="PRE">PRE</option>
                <option value="E-POST">E-POST</option>
                <option value="POST">POST</option>
                <option value="L-POST">L-POST</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Replication</label>
              <input
                type="text"
                placeholder="e.g. R1"
                value={obsForm.Replication}
                onChange={e => setObsForm(p => ({ ...p, Replication: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Plot Number</label>
              <input
                type="text"
                placeholder="e.g. 101"
                value={obsForm.PlotNumber}
                onChange={e => setObsForm(p => ({ ...p, PlotNumber: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-slate-700 text-[10px] uppercase">GPS Coordinates</span>
              <button
                type="button"
                onClick={handleGetGPS}
                className="text-[10px] text-emerald-700 font-bold bg-white px-2 py-0.5 rounded border flex items-center gap-0.5"
              >
                {gpsFetching ? 'Fetching...' : 'Get GPS Point'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] text-slate-500 font-bold">Latitude</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 20.5937"
                  value={obsForm.Lat}
                  onChange={e => setObsForm(p => ({ ...p, Lat: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500 font-bold">Longitude</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 78.9629"
                  value={obsForm.Lon}
                  onChange={e => setObsForm(p => ({ ...p, Lon: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-white border rounded"
                />
              </div>
            </div>
          </div>

          {/* Meteorological block */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-slate-700 text-[10px] uppercase">Meteorological Parameters</span>
              <button
                type="button"
                onClick={fetchWeather}
                className="text-[10px] text-emerald-700 font-bold bg-white px-2 py-0.5 rounded border"
              >
                Sync Weather API
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[9px] text-slate-500">Temp (°C)</label>
                <input
                  type="text"
                  value={obsForm.weatherTemp}
                  onChange={e => setObsForm(p => ({ ...p, weatherTemp: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Humidity (%)</label>
                <input
                  type="text"
                  value={obsForm.weatherHumidity}
                  onChange={e => setObsForm(p => ({ ...p, weatherHumidity: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Wind (km/h)</label>
                <input
                  type="text"
                  value={obsForm.weatherWind}
                  onChange={e => setObsForm(p => ({ ...p, weatherWind: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Precip (mm)</label>
                <input
                  type="text"
                  value={obsForm.weatherRain}
                  onChange={e => setObsForm(p => ({ ...p, weatherRain: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
            <span className="font-bold text-slate-700 text-[10px] uppercase">Soil Characteristics</span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] text-slate-500">Soil pH</label>
                <input
                  type="text"
                  placeholder="e.g. 6.5"
                  value={obsForm.SoilPH}
                  onChange={e => setObsForm(p => ({ ...p, SoilPH: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Clay (%)</label>
                <input
                  type="text"
                  placeholder="e.g. 35"
                  value={obsForm.SoilClay}
                  onChange={e => setObsForm(p => ({ ...p, SoilClay: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Sand (%)</label>
                <input
                  type="text"
                  placeholder="e.g. 40"
                  value={obsForm.SoilSand}
                  onChange={e => setObsForm(p => ({ ...p, SoilSand: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-slate-500">Organic Carbon (%)</label>
                <input
                  type="text"
                  placeholder="e.g. 1.2"
                  value={obsForm.SoilOC}
                  onChange={e => setObsForm(p => ({ ...p, SoilOC: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Soil Texture</label>
                <input
                  type="text"
                  placeholder="e.g. Clay loam"
                  value={obsForm.SoilTexture}
                  onChange={e => setObsForm(p => ({ ...p, SoilTexture: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Days After Treatment (DAT / DAA)</label>
              <input
                type="number"
                required
                placeholder="e.g. 14"
                value={obsForm.daa}
                onChange={e => setObsForm(p => ({ ...p, daa: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Assessment Date</label>
              <input
                type="date"
                required
                value={obsForm.date}
                onChange={e => setObsForm(p => ({ ...p, date: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Weed Growth Stage</label>
              <select
                value={obsForm.weedGrowthStage}
                onChange={e => setObsForm(p => ({ ...p, weedGrowthStage: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              >
                <option value="Seedling">Seedling</option>
                <option value="Vegetative">Vegetative</option>
                <option value="Flowering">Flowering</option>
                <option value="Mature">Mature</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Overall Growth Stage</label>
              <input
                type="text"
                placeholder="e.g. 2-4 leaf stage"
                value={obsForm.overallWeedGrowthStage}
                onChange={e => setObsForm(p => ({ ...p, overallWeedGrowthStage: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Yield Value</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 3.4"
                value={obsForm.yieldValue}
                onChange={e => setObsForm(p => ({ ...p, yieldValue: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Crop Injury (Phytotoxicity %)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={obsForm.cropPhytotoxicity}
                onChange={e => setObsForm(p => ({ ...p, cropPhytotoxicity: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Photo Direction</label>
              <select
                value={obsForm.photoDirection}
                onChange={e => setObsForm(p => ({ ...p, photoDirection: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              >
                <option value="North">North</option>
                <option value="East">East</option>
                <option value="South">South</option>
                <option value="West">West</option>
                <option value="Nadir">Nadir (Straight Down)</option>
              </select>
            </div>
          </div>

          {/* Camera upload box */}
          <div>
            <label className="block text-slate-600 font-bold mb-1">Field Stake Photograph</label>
            <div className="border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center bg-slate-50 border-slate-200">
              {obsForm.photoBase64 ? (
                <div className="relative w-full max-h-40 overflow-hidden rounded-lg">
                  <img src={obsForm.photoBase64} alt="Captured" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setObsForm(p => ({ ...p, photoBase64: '' }))}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center justify-center">
                  <Camera className="w-8 h-8 text-slate-400 mb-1" />
                  <span className="text-slate-500 font-bold text-xs">Choose or Snap Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoCapture}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            {obsForm.photoBase64 && (
              <button
                type="button"
                onClick={handleAIAssist}
                className="mt-2 w-full py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" /> Analyze with AI (Cover & Species)
              </button>
            )}
          </div>

          {/* Weed observations table */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-600 font-bold">Target Weeds Observations</label>
              <button
                type="button"
                onClick={() => {
                  setObsForm(prev => ({
                    ...prev,
                    weedObservations: [...prev.weedObservations, { species: '', cover: 0, bbch: '10' }]
                  }));
                }}
                className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> Add Weed Species
              </button>
            </div>
            <div className="space-y-2">
              {obsForm.weedObservations.map((wo, idx) => (
                <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <input
                    type="text"
                    placeholder="Weed Species (e.g. Crabgrass)"
                    value={wo.species}
                    onChange={e => {
                      const updated = [...obsForm.weedObservations];
                      updated[idx].species = e.target.value;
                      setObsForm(p => ({ ...p, weedObservations: updated }));
                    }}
                    className="flex-1 px-2 py-1 bg-white border rounded text-xs"
                  />
                  <input
                    type="number"
                    placeholder="Cover %"
                    value={wo.cover}
                    onChange={e => {
                      const updated = [...obsForm.weedObservations];
                      updated[idx].cover = Number(e.target.value);
                      setObsForm(p => ({ ...p, weedObservations: updated }));
                    }}
                    className="w-16 px-2 py-1 bg-white border rounded text-xs"
                  />
                  <input
                    type="text"
                    placeholder="BBCH"
                    value={wo.bbch}
                    onChange={e => {
                      const updated = [...obsForm.weedObservations];
                      updated[idx].bbch = e.target.value;
                      setObsForm(p => ({ ...p, weedObservations: updated }));
                    }}
                    className="w-16 px-2 py-1 bg-white border rounded text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = obsForm.weedObservations.filter((_, i) => i !== idx);
                      setObsForm(p => ({ ...p, weedObservations: updated }));
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Notes</label>
              <textarea
                placeholder="Observation notes..."
                value={obsForm.notes}
                onChange={e => setObsForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none h-16 text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Conclusion</label>
              <textarea
                placeholder="Final conclusion..."
                value={obsForm.conclusion}
                onChange={e => setObsForm(p => ({ ...p, conclusion: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none h-16 text-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 transition"
          >
            Save Field Observation Record
          </button>
        </form>
      </Modal>

    </div>
  );
}
