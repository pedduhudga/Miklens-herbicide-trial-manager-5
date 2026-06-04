import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addProject, updateProject, deleteProject, uploadPhoto } from '../services/dataLayer.js';
import {
  fbGetSectors,
  fbAddSector,
  fbDeleteSector,
  fbGetQuadrants,
  fbAddQuadrant,
  fbDeleteQuadrant,
  fbGetVisits,
  fbAddVisit,
  fbDeleteVisit,
  fbGetLargeScaleData
} from '../services/largeScaleService.js';
import {
  Plus, Trash2, MapPin, Calendar, Camera, Info, Sparkles, Search, Filter, X,
  Compass, Map as MapIcon, RefreshCw, Activity, Layers, Thermometer, Wind, Droplets, CloudRain,
  Eye, CheckCircle, ChevronRight, BarChart2, ShieldAlert
} from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { analyzePhoto, identifyWeedFromPhoto } from '../services/multiProviderAI.js';

// Leaflet is loaded from CDN in index.html
const L = window.L;

export default function LargeScaleTrials({ onMenuClick }) {
  const { state, updateState, getAppState, dispatch } = useAppState();
  
  // Projects of Design = 'LargeScale'
  const macroProjects = useMemo(() => {
    return (state.projects || []).filter(p => p.Design === 'LargeScale');
  }, [state.projects]);

  const [activeProjectId, setActiveProjectId] = useState('');
  const [sectors, setSectors] = useState([]);
  const [quadrants, setQuadrants] = useState([]);
  const [visitsMap, setVisitsMap] = useState({}); // { [quadrantId]: [visits] }
  const [loading, setLoading] = useState(false);

  // Active items for detailed view or creation
  const [activeSectorId, setActiveSectorId] = useState('');
  const [activeQuadrantId, setActiveQuadrantId] = useState('');
  const [activeVisitId, setActiveVisitId] = useState('');

  // Modals state
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isSectorModalOpen, setIsSectorModalOpen] = useState(false);
  const [isQuadModalOpen, setIsQuadModalOpen] = useState(false);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);

  // Forms
  const [projectForm, setProjectForm] = useState({ Name: '', Crop: '', Location: '', Investigator: '', TargetWeeds: '', GPSBounds: '' });
  const [sectorForm, setSectorForm] = useState({ Name: '', Code: '', FormulationID: '', Dosage: '' });
  const [quadForm, setQuadForm] = useState({ Lat: '', Lon: '', Notes: '' });
  const [visitForm, setVisitForm] = useState({
    daa: '',
    date: new Date().toISOString().split('T')[0],
    weatherTemp: '',
    weatherHumidity: '',
    weatherWind: '',
    weatherRain: '',
    cropPhytotoxicity: 0,
    weedObservations: [],
    photoBase64: '',
    photoDirection: 'North'
  });

  // Selected weed for the comparative WCE chart
  const [selectedWeedForChart, setSelectedWeedForChart] = useState('Total');

  // Leaflet map refs
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersGroupRef = useRef(null);
  const [gpsFetching, setGpsFetching] = useState(false);
  const [gpsPosition, setGpsPosition] = useState(null);

  // Load sectors/quadrants/visits when project changes
  useEffect(() => {
    if (!activeProjectId) {
      setSectors([]);
      setQuadrants([]);
      setVisitsMap({});
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const data = await fbGetLargeScaleData(activeProjectId);
        setSectors(data.sectors || []);
        
        // Flatten quadrants from the map
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
        console.error('Failed to load large scale trial data', err);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to load project details.', type: 'error' } }));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeProjectId]);

  // Leaflet map initializer
  useEffect(() => {
    if (!L || !mapContainerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView([20.5937, 78.9629], 5);
      L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: 'Google Satellite Hybrid',
        maxZoom: 22,
        maxNativeZoom: 19
      }).addTo(mapRef.current);

      markersGroupRef.current = L.layerGroup().addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map markers when quadrants list changes
  useEffect(() => {
    if (!mapRef.current || !markersGroupRef.current) return;

    markersGroupRef.current.clearLayers();
    const coords = [];

    quadrants.forEach(q => {
      const lat = parseFloat(q.Lat);
      const lon = parseFloat(q.Lon);
      if (isNaN(lat) || isNaN(lon)) return;

      coords.push([lat, lon]);
      const sector = sectors.find(s => s.ID === q.sectorId);
      const sectorName = sector ? sector.Name : 'Unknown Sector';

      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'custom-quad-pin',
          html: `<div class="w-8 h-8 rounded-full bg-emerald-600 border-2 border-white flex items-center justify-center text-white font-bold text-xs shadow-lg">${q.ID.split('-').pop() || 'Q'}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      });

      marker.bindPopup(`
        <div class="p-2 font-sans">
          <h4 class="font-bold text-sm text-slate-800">${q.ID}</h4>
          <p class="text-xs text-slate-500">Sector: ${sectorName}</p>
          <p class="text-xs text-slate-500">${lat.toFixed(5)}, ${lon.toFixed(5)}</p>
        </div>
      `);
      
      marker.addTo(markersGroupRef.current);
    });

    if (coords.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(coords).pad(0.2));
    }
  }, [quadrants, sectors]);

  // GPS position tracking
  const handleGetGPS = () => {
    if (!navigator.geolocation) return;
    setGpsFetching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGpsPosition({ lat: latitude, lon: longitude });
        setQuadForm(prev => ({ ...prev, Lat: latitude.toFixed(6), Lon: longitude.toFixed(6) }));
        setGpsFetching(false);
        if (mapRef.current) {
          mapRef.current.setView([latitude, longitude], 17);
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
    const quad = quadrants.find(q => q.ID === activeQuadrantId);
    if (!quad) return;
    const lat = parseFloat(quad.Lat);
    const lon = parseFloat(quad.Lon);
    if (isNaN(lat) || isNaN(lon)) return;

    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`);
      const d = await res.json();
      const c = d.current;
      if (c) {
        setVisitForm(prev => ({
          ...prev,
          weatherTemp: c.temperature_2m ?? prev.weatherTemp,
          weatherHumidity: c.relative_humidity_2m ?? prev.weatherHumidity,
          weatherWind: c.wind_speed_10m ?? prev.weatherWind,
          weatherRain: c.precipitation ?? prev.weatherRain
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather data synced!', type: 'success' } }));
      }
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather sync failed', type: 'info' } }));
    }
  };

  // Auto-numbering system helper
  const nextQuadNumber = useMemo(() => {
    if (!activeSectorId) return 'Q01';
    const sector = sectors.find(s => s.ID === activeSectorId);
    if (!sector) return 'Q01';
    
    const count = quadrants.filter(q => q.sectorId === activeSectorId).length;
    const nextIdx = count + 1;
    return `Q${String(nextIdx).padStart(2, '0')}`;
  }, [activeSectorId, quadrants, sectors]);

  // CRUD Actions
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

  const handleSaveSector = async (e) => {
    e.preventDefault();
    if (!activeProjectId) return;
    const payload = {
      ...sectorForm,
      ID: `sector_${Date.now()}`
    };

    try {
      const res = await fbAddSector(activeProjectId, payload, state.auth?.uid);
      setSectors(prev => [...prev, res]);
      setIsSectorModalOpen(false);
      setSectorForm({ Name: '', Code: '', FormulationID: '', Dosage: '' });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Sector created!', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to create sector.', type: 'error' } }));
    }
  };

  const handleSaveQuadrant = async (e) => {
    e.preventDefault();
    if (!activeProjectId || !activeSectorId) return;
    const sector = sectors.find(s => s.ID === activeSectorId);
    const id = `${sector.Code || 'SEC'}-${nextQuadNumber}`;

    const payload = {
      ...quadForm,
      ID: id,
      id: id,
      sectorId: activeSectorId
    };

    try {
      const res = await fbAddQuadrant(activeProjectId, activeSectorId, payload, state.auth?.uid);
      setQuadrants(prev => [...prev, { ...res, sectorId: activeSectorId }]);
      setIsQuadModalOpen(false);
      setQuadForm({ Lat: '', Lon: '', Notes: '' });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Quadrant ${id} created!`, type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to create quadrant.', type: 'error' } }));
    }
  };

  // Image Optimization using 1920 max-dim / 0.95 quality
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
        setVisitForm(prev => ({ ...prev, photoBase64: optimizedBase64 }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // AI Assist observation parsing
  const handleAIAssist = async () => {
    if (!visitForm.photoBase64) return;
    setLoading(true);
    try {
      const aiResponse = await identifyWeedFromPhoto(visitForm.photoBase64);
      if (aiResponse && Array.isArray(aiResponse)) {
        const observations = aiResponse.map(weed => ({
          species: weed.name || 'Unknown',
          cover: Math.round((weed.cover || 0) * 100) || 10,
          bbch: weed.growthStage || '10',
          count: Math.round(weed.cover * 10) || 5
        }));
        setVisitForm(prev => ({
          ...prev,
          weedObservations: observations,
          weedCover: observations.reduce((acc, curr) => acc + curr.cover, 0)
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

  const handleSaveVisit = async (e) => {
    e.preventDefault();
    if (!activeProjectId || !activeQuadrantId) return;

    // Find the sector of this quadrant
    const quad = quadrants.find(q => q.ID === activeQuadrantId);
    if (!quad) return;
    const sector = sectors.find(s => s.ID === quad.sectorId);

    const project = macroProjects.find(p => p.ID === activeProjectId);
    const projectName = project ? project.Name : 'Ungrouped Projects';

    let photos = [];
    const visitId = `visit_${Date.now()}`;

    // Upload photo to Drive if present
    if (visitForm.photoBase64) {
      const fileName = `${activeQuadrantId}_${visitForm.daa}DAT_${Date.now()}.jpg`;
      const folderPath = [projectName, sector ? sector.Name : 'Ungrouped', activeQuadrantId];

      try {
        const uploadResult = await uploadPhoto({
          trialId: activeQuadrantId,
          fileData: visitForm.photoBase64,
          mimeType: 'image/jpeg',
          fileName,
          folderPath
        }, getAppState);

        if (uploadResult && uploadResult.url) {
          photos.push({
            id: uploadResult.id,
            url: uploadResult.url,
            name: fileName,
            direction: visitForm.photoDirection
          });
        }
      } catch (err) {
        console.warn('Drive photo upload failed, using local caching:', err);
      }
    }

    const payload = {
      ID: visitId,
      daa: Number(visitForm.daa),
      date: visitForm.date,
      weatherTemp: visitForm.weatherTemp,
      weatherHumidity: visitForm.weatherHumidity,
      weatherWind: visitForm.weatherWind,
      weatherRain: visitForm.weatherRain,
      cropPhytotoxicity: Number(visitForm.cropPhytotoxicity),
      weedObservations: visitForm.weedObservations,
      photos
    };

    try {
      const res = await fbAddVisit(activeProjectId, quad.sectorId, activeQuadrantId, payload, state.auth?.uid);
      setVisitsMap(prev => ({
        ...prev,
        [activeQuadrantId]: [...(prev[activeQuadrantId] || []), res].sort((a, b) => a.daa - b.daa)
      }));
      setIsVisitModalOpen(false);
      setVisitForm({
        daa: '',
        date: new Date().toISOString().split('T')[0],
        weatherTemp: '',
        weatherHumidity: '',
        weatherWind: '',
        weatherRain: '',
        cropPhytotoxicity: 0,
        weedObservations: [],
        photoBase64: '',
        photoDirection: 'North'
      });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Observation Visit saved!', type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save visit data.', type: 'error' } }));
    }
  };

  const handleDeleteVisit = async (visitId, quadId) => {
    if (!window.confirm('Delete this observation visit record?')) return;
    const quad = quadrants.find(q => q.ID === quadId);
    if (!quad) return;

    try {
      await fbDeleteVisit(activeProjectId, quad.sectorId, quadId, visitId);
      setVisitsMap(prev => ({
        ...prev,
        [quadId]: (prev[quadId] || []).filter(v => v.ID !== visitId)
      }));
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Visit deleted.', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete visit.', type: 'error' } }));
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
            // Find cover % for selected weed or 'Total'
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

        // Compute WCE% relative to untreated control sector (or baseline cover if no untreated control matches)
        const avgCover = count > 0 ? sumCover / count : null;
        return avgCover;
      });

      return {
        label: sector.Name,
        code: sector.Code,
        data: values // Array of avg cover percentages matching the daas index
      };
    });

    // Translate cover % to WCE% against the maximum sector (which serves as baseline untreated control)
    // Formula: WCE = 100 * (1 - (Sector_Avg_Cover / Max_Sector_Avg_Cover))
    const formattedDatasets = datasets.map(ds => {
      const wceData = ds.data.map((val, idx) => {
        if (val === null) return null;
        // Find max cover amongst all sectors at this DAA index (serves as untreated control control level)
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

          <button
            onClick={() => setIsProjectModalOpen(true)}
            className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800 transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Field Trial Project
          </button>
        </div>

        {activeProjectId ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left side: Maps and Sectors list */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* GIS Map Canvas */}
              <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100 flex flex-col h-[400px] relative">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-55/20">
                  <span className="font-bold text-slate-700 text-sm flex items-center gap-2">
                    <MapIcon className="w-4 h-4 text-emerald-600" /> GPS Quadrants Map
                  </span>
                  <button
                    onClick={handleGetGPS}
                    className="text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-bold px-3 py-1 rounded-lg transition"
                  >
                    Locate Me
                  </button>
                </div>
                <div ref={mapContainerRef} className="flex-1 w-full" />
              </div>

              {/* Side-by-side comparative line chart */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                      <BarChart2 className="w-5 h-5 text-emerald-600" /> Efficacy Timeline (WCE%)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Weed Control Efficacy compared side-by-side per treatment sector</p>
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
                          const yPos = 200 - (yVal * 1.8) - 10;
                          return (
                            <g key={yVal}>
                              <line x1="40" y1={yPos} x2="480" y2={yPos} stroke="#f1f5f9" strokeWidth="1" />
                              <text x="10" y={yPos + 4} fill="#94a3b8" fontSize="8" fontWeight="bold">{yVal}%</text>
                            </g>
                          );
                        })}

                        {/* Chart Lines */}
                        {comparativeChartData.datasets.map((dataset, dsIdx) => {
                          const points = dataset.data.map((val, idx) => {
                            if (val === null) return null;
                            const x = 40 + (idx / (comparativeChartData.daas.length - 1 || 1)) * 440;
                            const y = 200 - (val * 1.8) - 10;
                            return `${x},${y}`;
                          }).filter(p => p !== null).join(' ');

                          const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];
                          const strokeColor = colors[dsIdx % colors.length];

                          return (
                            <g key={dataset.label}>
                              <polyline
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth="3"
                                points={points}
                              />
                              {dataset.data.map((val, idx) => {
                                if (val === null) return null;
                                const x = 40 + (idx / (comparativeChartData.daas.length - 1 || 1)) * 440;
                                const y = 200 - (val * 1.8) - 10;
                                return (
                                  <circle
                                    key={idx}
                                    cx={x}
                                    cy={y}
                                    r="4"
                                    fill={strokeColor}
                                    stroke="#fff"
                                    strokeWidth="2"
                                    className="cursor-pointer group"
                                  >
                                    <title>{dataset.label}: {val}% (DAA {comparativeChartData.daas[idx]})</title>
                                  </circle>
                                );
                              })}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                    {/* X-Axis labels */}
                    <div className="flex justify-between px-10 text-[9px] font-bold text-slate-400 mt-2">
                      {comparativeChartData.daas.map(d => <span key={d}>DAA {d}</span>)}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-4 justify-center mt-4">
                      {comparativeChartData.datasets.map((dataset, dsIdx) => {
                        const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];
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

            {/* Right side: Sectors List, Quadrants list, observations logger */}
            <div className="space-y-6">
              
              {/* Sectors Manager */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-600" /> Sector Zones
                  </h3>
                  <button
                    onClick={() => setIsSectorModalOpen(true)}
                    className="p-1 rounded-full hover:bg-slate-100 text-emerald-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {sectors.map(sector => (
                    <div
                      key={sector.ID}
                      onClick={() => setActiveSectorId(activeSectorId === sector.ID ? '' : sector.ID)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex justify-between items-center ${
                        activeSectorId === sector.ID
                          ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500/20'
                          : 'border-slate-100 hover:border-emerald-300'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-800 text-xs flex items-center gap-2">
                          <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[10px]">{sector.Code}</span>
                          {sector.Name}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">{sector.Dosage || 'No Dosage'}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
                  {sectors.length === 0 && <p className="text-xs text-slate-400 italic py-2 text-center">No sectors configured.</p>}
                </div>
              </div>

              {/* Quadrant Assessment Points */}
              {activeSectorId && (
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-600" /> Quadrant Stakes
                    </h3>
                    <button
                      onClick={() => setIsQuadModalOpen(true)}
                      className="p-1 rounded-full hover:bg-slate-100 text-emerald-700"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {quadrants.filter(q => q.sectorId === activeSectorId).map(quad => (
                      <div
                        key={quad.ID}
                        onClick={() => setActiveQuadrantId(activeQuadrantId === quad.ID ? '' : quad.ID)}
                        className={`p-3 rounded-xl border transition cursor-pointer ${
                          activeQuadrantId === quad.ID
                            ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500/20'
                            : 'border-slate-100 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="font-bold text-slate-800 text-xs">{quad.ID}</div>
                          <span className="text-[10px] text-slate-400">{(visitsMap[quad.ID] || []).length} visits</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">{quad.Lat}, {quad.Lon}</div>

                        {activeQuadrantId === quad.ID && (
                          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Timeline Visits</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsVisitModalOpen(true);
                                }}
                                className="px-2 py-0.5 bg-emerald-700 text-white text-[10px] rounded hover:bg-emerald-800 transition"
                              >
                                Log Visit
                              </button>
                            </div>
                            
                            {(visitsMap[quad.ID] || []).map((visit, vIdx) => (
                              <div key={visit.ID} className="bg-slate-50 p-2 rounded-lg text-xs flex justify-between items-center">
                                <div>
                                  <span className="font-bold text-slate-700">DAA {visit.daa}</span>
                                  <span className="text-slate-400 text-[10px] ml-2">{visit.date}</span>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    Obs: {visit.weedObservations?.map(wo => `${wo.species} (${wo.cover}%)`).join(', ') || 'No weeds'}
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteVisit(visit.ID, quad.ID);
                                  }}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {quadrants.filter(q => q.sectorId === activeSectorId).length === 0 && (
                      <p className="text-xs text-slate-400 italic py-2 text-center">No quadrants in this sector.</p>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        ) : (
          <div className="py-24 text-center bg-white border border-slate-100 rounded-3xl shadow-sm">
            <Compass className="w-16 h-16 mx-auto text-slate-200 mb-4 animate-pulse" />
            <h3 className="font-bold text-slate-700 text-lg">No Workspace Selected</h3>
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

      {/* Modal: Add Sector */}
      <Modal isOpen={isSectorModalOpen} onClose={() => setIsSectorModalOpen(false)} title="Add Treatment Sector">
        <form onSubmit={handleSaveSector} className="space-y-4 font-sans text-xs">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-slate-600 font-bold mb-1">Sector Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Sector West - Glyphosate"
                value={sectorForm.Name}
                onChange={e => setSectorForm(p => ({ ...p, Name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Code</label>
              <input
                type="text"
                required
                placeholder="e.g. SEC-A"
                value={sectorForm.Code}
                onChange={e => setSectorForm(p => ({ ...p, Code: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Formulation / Treatment</label>
              <select
                value={sectorForm.FormulationID}
                onChange={e => setSectorForm(p => ({ ...p, FormulationID: e.target.value }))}
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
                value={sectorForm.Dosage}
                onChange={e => setSectorForm(p => ({ ...p, Dosage: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 transition"
          >
            Create Sector
          </button>
        </form>
      </Modal>

      {/* Modal: Add Quadrant */}
      <Modal isOpen={isQuadModalOpen} onClose={() => setIsQuadModalOpen(false)} title={`Add Quadrant Stake to ${sectors.find(s => s.ID === activeSectorId)?.Name || ''}`}>
        <form onSubmit={handleSaveQuadrant} className="space-y-4 font-sans text-xs">
          <div className="bg-slate-50 p-3 rounded-lg flex items-center justify-between border border-slate-200">
            <div>
              <label className="block text-slate-600 font-bold text-[10px]">AUTO-GENERATED LABEL</label>
              <span className="text-slate-800 font-bold text-base">
                {sectors.find(s => s.ID === activeSectorId)?.Code || 'SEC'}-{nextQuadNumber}
              </span>
            </div>
            <button
              type="button"
              onClick={handleGetGPS}
              className="px-3 py-2 bg-emerald-700 text-white font-bold rounded hover:bg-emerald-800 transition"
            >
              Get GPS Point
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Latitude</label>
              <input
                type="text"
                required
                placeholder="e.g. 20.5937"
                value={quadForm.Lat}
                onChange={e => setQuadForm(p => ({ ...p, Lat: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Longitude</label>
              <input
                type="text"
                required
                placeholder="e.g. 78.9629"
                value={quadForm.Lon}
                onChange={e => setQuadForm(p => ({ ...p, Lon: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-slate-600 font-bold mb-1">Quadrant Field Notes</label>
            <textarea
              placeholder="e.g. Located near drainage trench, high weed density."
              value={quadForm.Notes}
              onChange={e => setQuadForm(p => ({ ...p, Notes: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none h-16"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 transition"
          >
            Create Quadrant Stake
          </button>
        </form>
      </Modal>

      {/* Modal: Add Visit Observation */}
      <Modal isOpen={isVisitModalOpen} onClose={() => setIsVisitModalOpen(false)} title={`Log Visit for Quadrant ${activeQuadrantId}`}>
        <form onSubmit={handleSaveVisit} className="space-y-4 font-sans text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Days After Treatment (DAT / DAA)</label>
              <input
                type="number"
                required
                placeholder="e.g. 14"
                value={visitForm.daa}
                onChange={e => setVisitForm(p => ({ ...p, daa: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Assessment Date</label>
              <input
                type="date"
                required
                value={visitForm.date}
                onChange={e => setVisitForm(p => ({ ...p, date: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
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
                  value={visitForm.weatherTemp}
                  onChange={e => setVisitForm(p => ({ ...p, weatherTemp: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Humidity (%)</label>
                <input
                  type="text"
                  value={visitForm.weatherHumidity}
                  onChange={e => setVisitForm(p => ({ ...p, weatherHumidity: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Wind (km/h)</label>
                <input
                  type="text"
                  value={visitForm.weatherWind}
                  onChange={e => setVisitForm(p => ({ ...p, weatherWind: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Precip (mm)</label>
                <input
                  type="text"
                  value={visitForm.weatherRain}
                  onChange={e => setVisitForm(p => ({ ...p, weatherRain: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Crop Damage (Phytotoxicity %)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={visitForm.cropPhytotoxicity}
                onChange={e => setVisitForm(p => ({ ...p, cropPhytotoxicity: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Photo Direction</label>
              <select
                value={visitForm.photoDirection}
                onChange={e => setVisitForm(p => ({ ...p, photoDirection: e.target.value }))}
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
            <label className="block text-slate-600 font-bold mb-1">Field Quadrant Photo</label>
            <div className="border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center bg-slate-50 border-slate-200">
              {visitForm.photoBase64 ? (
                <div className="relative w-full max-h-40 overflow-hidden rounded-lg">
                  <img src={visitForm.photoBase64} alt="Captured" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setVisitForm(p => ({ ...p, photoBase64: '' }))}
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
            {visitForm.photoBase64 && (
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
                  setVisitForm(prev => ({
                    ...prev,
                    weedObservations: [...prev.weedObservations, { species: '', cover: 0, bbch: '10', count: 0 }]
                  }));
                }}
                className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> Add Weed
              </button>
            </div>
            <div className="space-y-2">
              {visitForm.weedObservations.map((wo, idx) => (
                <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <input
                    type="text"
                    placeholder="Weed Species (e.g. Crabgrass)"
                    value={wo.species}
                    onChange={e => {
                      const updated = [...visitForm.weedObservations];
                      updated[idx].species = e.target.value;
                      setVisitForm(p => ({ ...p, weedObservations: updated }));
                    }}
                    className="flex-1 px-2 py-1 bg-white border rounded text-xs"
                  />
                  <input
                    type="number"
                    placeholder="Cover %"
                    value={wo.cover}
                    onChange={e => {
                      const updated = [...visitForm.weedObservations];
                      updated[idx].cover = Number(e.target.value);
                      setVisitForm(p => ({ ...p, weedObservations: updated }));
                    }}
                    className="w-16 px-2 py-1 bg-white border rounded text-xs"
                  />
                  <input
                    type="text"
                    placeholder="BBCH"
                    value={wo.bbch}
                    onChange={e => {
                      const updated = [...visitForm.weedObservations];
                      updated[idx].bbch = e.target.value;
                      setVisitForm(p => ({ ...p, weedObservations: updated }));
                    }}
                    className="w-16 px-2 py-1 bg-white border rounded text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = visitForm.weedObservations.filter((_, i) => i !== idx);
                      setVisitForm(p => ({ ...p, weedObservations: updated }));
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 transition"
          >
            Save Visit Observation
          </button>
        </form>
      </Modal>

    </div>
  );
}
