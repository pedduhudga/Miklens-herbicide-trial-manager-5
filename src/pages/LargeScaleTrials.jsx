import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import CameraCapture from '../components/CameraCapture.jsx';
import {
  addProject,
  deleteProject,
  addTrial,
  deleteTrial,
  updateTrial,
  uploadPhoto
} from '../services/dataLayer.js';
import {
  Plus, Trash2, MapPin, Calendar, Camera, Info, Sparkles, X,
  Compass, Map as MapIcon, RefreshCw, Layers, Thermometer, Wind, Droplets, CloudRain,
  Eye, CheckCircle, ChevronRight, BarChart2, Edit, ArrowLeft, FileText, Download,
  TrendingUp, Leaf, SlidersHorizontal, BookOpen, Layers3
} from 'lucide-react';
import { getAPIKeys } from '../services/multiProviderAI.js';
import { calculateDAA, toDatetimeLocal, formatDate, formatDateTime } from '../utils/dateUtils.js';
import { safeJsonParse } from '../utils/helpers.js';
import { validateEfficacyData } from '../utils/analysisUtils.js';
import {
  generateComprehensivePdf,
  generateScientificReport,
  generatePpt,
  exportToCSV,
  exportHtmlReport,
  exportTrialDocx,
  generateMasterComprehensivePdf,
  generateMasterScientificReport,
  generateMasterPpt,
  exportMasterCSV,
  exportMasterHtml,
  exportMasterDocx
} from '../services/trialReports.js';

const L = window.L;

const emptySubTrialForm = () => ({
  FormulationName: '',
  InvestigatorName: '',
  Date: toDatetimeLocal(new Date()),
  Location: '',
  Dosage: '',
  Lat: '',
  Lon: '',
  WeedSpecies: '',
  Result: 'Pending',
  Notes: '',
  Conclusion: '',
  IsControl: false,
  IsStandardCheck: false,
  IsCompleted: false,
  Replication: 'R1',
  PlotNumber: '',
  Temperature: '',
  Humidity: '',
  Windspeed: '',
  Rain: '',
  SoilPH: '',
  SoilClay: '',
  SoilSand: '',
  SoilOC: '',
  SoilTexture: '',
  ApplicationTiming: 'POST',
  WeedGrowthStage: 'Vegetative',
  EfficacyDataJSON: '[]',
  PhotoURLs: '[]',
  WeedPhotosJSON: '[]',
  AISummariesJSON: '{}'
});

const emptyVisitForm = () => ({
  daa: '',
  date: new Date().toISOString().split('T')[0],
  weedCover: '',
  notes: '',
  weatherTemp: '',
  weatherHumidity: '',
  weatherWind: '',
  weatherRain: '',
  photoUrl: '',
  weedDetails: []
});

export default function LargeScaleTrials({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();

  // Master projects filter
  const masterProjects = useMemo(() => {
    return (state.projects || []).filter(p => p.Design === 'LargeScale');
  }, [state.projects]);

  const [activeProjectId, setActiveProjectId] = useState('');
  const [selectedSubTrialId, setSelectedSubTrialId] = useState('');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isSubTrialModalOpen, setIsSubTrialModalOpen] = useState(false);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [editingSubTrial, setEditingSubTrial] = useState(null);
  const [editingVisitIdx, setEditingVisitIdx] = useState(null);

  // Forms
  const [projectForm, setProjectForm] = useState({ Name: '', Crop: '', Location: '', Investigator: '', TargetWeeds: '', GPSBounds: '' });
  const [subTrialForm, setSubTrialForm] = useState(emptySubTrialForm());
  const [visitForm, setVisitForm] = useState(emptyVisitForm());

  // UI state
  const [dashboardTab, setDashboardTab] = useState('map'); // 'map' | 'charts' | 'ai'
  const [loading, setLoading] = useState(false);
  const [aiReportRunning, setAiReportRunning] = useState(false);
  const [gpsFetching, setGpsFetching] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Map refs
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersGroupRef = useRef(null);

  // Selected Master Project document
  const activeProject = useMemo(() => {
    return masterProjects.find(p => p.ID === activeProjectId);
  }, [masterProjects, activeProjectId]);

  // Sub-trials belonging to active project
  const subTrials = useMemo(() => {
    if (!activeProjectId) return [];
    return (state.trials || []).filter(t => t.ProjectID === activeProjectId);
  }, [state.trials, activeProjectId]);

  // Active sub-trial details
  const activeSubTrial = useMemo(() => {
    return subTrials.find(t => t.ID === selectedSubTrialId);
  }, [subTrials, selectedSubTrialId]);

  // Initialise Leaflet Map
  useEffect(() => {
    if (!L || !mapContainerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView([20.5937, 78.9629], 5);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 20
      }).addTo(mapRef.current);

      markersGroupRef.current = L.layerGroup().addTo(mapRef.current);

      setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 400);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [dashboardTab, activeProjectId]);

  // Draw sub-trial markers on Map
  useEffect(() => {
    if (!mapRef.current || !markersGroupRef.current) return;

    markersGroupRef.current.clearLayers();
    const coords = [];

    subTrials.forEach(st => {
      const lat = parseFloat(st.Lat);
      const lon = parseFloat(st.Lon);
      if (isNaN(lat) || isNaN(lon)) return;

      coords.push([lat, lon]);

      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'custom-subtrial-pin',
          html: `<div class="w-8 h-8 rounded-full bg-emerald-600 border-2 border-white flex items-center justify-center text-white font-bold text-xs shadow-lg hover:bg-emerald-700 transition-colors">${st.Replication || 'ST'}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      });

      marker.bindPopup(`
        <div class="p-2.5 font-sans text-xs min-w-[140px]">
          <h4 class="font-bold text-slate-800">${st.FormulationName || 'Untreated Spot'}</h4>
          <p class="text-slate-500 font-medium mt-0.5">Rep: ${st.Replication} | Plot: ${st.PlotNumber || 'N/A'}</p>
          <p class="text-slate-400 mt-1">${lat.toFixed(6)}, ${lon.toFixed(6)}</p>
          <button onclick="window.dispatchEvent(new CustomEvent('app:select-subtrial', {detail: '${st.ID}'}))" class="mt-2 w-full px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded text-[10px] text-center border-none cursor-pointer">Inspect Spot</button>
        </div>
      `);

      marker.addTo(markersGroupRef.current);
    });

    if (coords.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(coords).pad(0.25));
    }
  }, [subTrials]);

  // Listen for popup select event
  useEffect(() => {
    const handleSelectST = (e) => {
      setSelectedSubTrialId(e.detail);
    };
    window.addEventListener('app:select-subtrial', handleSelectST);
    return () => window.removeEventListener('app:select-subtrial', handleSelectST);
  }, []);

  // Fetch coordinates
  const handleGetGPS = () => {
    if (!navigator.geolocation) return;
    setGpsFetching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setSubTrialForm(prev => ({ ...prev, Lat: latitude.toFixed(6), Lon: longitude.toFixed(6) }));
        setGpsFetching(false);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'GPS coordinates updated!', type: 'success' } }));
      },
      () => {
        setGpsFetching(false);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Unable to retrieve location.', type: 'error' } }));
      },
      { enableHighAccuracy: true }
    );
  };

  // Weather fetch for sub-trial creation
  const fetchWeather = async () => {
    const lat = parseFloat(subTrialForm.Lat);
    const lon = parseFloat(subTrialForm.Lon);
    if (isNaN(lat) || isNaN(lon)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Enter GPS coordinates to fetch weather.', type: 'error' } }));
      return;
    }
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`);
      const d = await res.json();
      const c = d.current;
      if (c) {
        setSubTrialForm(prev => ({
          ...prev,
          Temperature: c.temperature_2m?.toString() || '',
          Humidity: c.relative_humidity_2m?.toString() || '',
          Windspeed: c.wind_speed_10m?.toString() || '',
          Rain: c.precipitation?.toString() || ''
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather parameters synced!', type: 'success' } }));
      }
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather sync failed.', type: 'error' } }));
    }
  };

  // Weather fetch for visits
  const fetchVisitWeather = async () => {
    const lat = parseFloat(activeSubTrial?.Lat);
    const lon = parseFloat(activeSubTrial?.Lon);
    if (isNaN(lat) || isNaN(lon)) return;
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`);
      const d = await res.json();
      const c = d.current;
      if (c) {
        setVisitForm(prev => ({
          ...prev,
          weatherTemp: c.temperature_2m?.toString() || '',
          weatherHumidity: c.relative_humidity_2m?.toString() || '',
          weatherWind: c.wind_speed_10m?.toString() || '',
          weatherRain: c.precipitation?.toString() || ''
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather synced for visit!', type: 'success' } }));
      }
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather sync failed.', type: 'error' } }));
    }
  };

  // Create Project Workspace
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
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Large Field Trial Workspace Created!', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to create workspace.', type: 'error' } }));
    }
  };

  // Create or Update Sub-Trial
  const handleSaveSubTrial = async (e) => {
    e.preventDefault();
    if (!activeProjectId) return;

    const formMatch = state.formulations?.find(f => f.Name === subTrialForm.FormulationName);
    const isEdit = !!editingSubTrial;

    const payload = {
      ...(isEdit ? editingSubTrial : {}),
      ...subTrialForm,
      ProjectID: activeProjectId,
      FormulationID: formMatch?.ID || '',
      IsLive: true,
      UpdatedAt: new Date().toISOString(),
      ...(isEdit ? {} : {
        ID: `sub_${Date.now()}`,
        CreatedAt: new Date().toISOString()
      })
    };

    try {
      if (isEdit) {
        await updateTrial(payload, getAppState);
        updateState({ trials: state.trials.map(t => t.ID === payload.ID ? payload : t) });
      } else {
        await addTrial(payload, getAppState);
        updateState({ trials: [...(state.trials || []), payload] });
      }
      setIsSubTrialModalOpen(false);
      setEditingSubTrial(null);
      setSubTrialForm(emptySubTrialForm());
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Sub-trial ${isEdit ? 'updated' : 'created'} successfully!`, type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save sub-trial.', type: 'error' } }));
    }
  };

  // Delete Sub-Trial
  const handleDeleteSubTrial = async (stId, e) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this sub-trial and all its logs?')) return;
    try {
      await deleteTrial({ ID: stId }, getAppState);
      updateState({ trials: state.trials.filter(t => t.ID !== stId) });
      if (selectedSubTrialId === stId) setSelectedSubTrialId('');
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Sub-trial deleted.', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete sub-trial.', type: 'error' } }));
    }
  };

  // Photo Capture
  const handleCapturePhoto = (dataUrl) => {
    setVisitForm(prev => ({ ...prev, photoUrl: dataUrl }));
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Photo captured! Run AI to analyze.', type: 'success' } }));
  };

  // Image upload fallback
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setVisitForm(prev => ({ ...prev, photoUrl: event.target.result }));
    };
    reader.readAsDataURL(file);
  };

  // AI weed analysis for visits
  const handleAnalyzePhoto = async () => {
    if (!visitForm.photoUrl) return;
    setLoading(true);
    try {
      // Find Gemini API Key
      const keys = getAPIKeys('gemini-3-flash');
      if (!keys.length) {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please configure Gemini API key in Settings.', type: 'error' } }));
        setLoading(false);
        return;
      }
      
      const mimeType = visitForm.photoUrl.split(';')[0].split(':')[1] || 'image/jpeg';
      const base64 = visitForm.photoUrl.split(',')[1];
      
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${keys[0]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Identify all weed species in this field photo. For each species, provide: 1) Scientific name, 2) Common name, 3) Estimated cover percentage (0-100), 4) Status/Response (e.g. Unaffected, Slight Injury, Moderate Injury, Severe Injury, Dead/Desiccated). Output as a JSON array only, like: [{"species":"Common Name (Scientific)","cover":20,"status":"Severe Injury","bbch":"15"}]' },
              { inlineData: { mimeType, data: base64 } }
            ]
          }]
        })
      });

      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const d = await resp.json();
      const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = txt.match(/\[.*\]/s);
      if (match) {
        const weeds = JSON.parse(match[0]);
        const totalCover = weeds.reduce((acc, w) => acc + (w.cover || 0), 0);
        setVisitForm(prev => ({
          ...prev,
          weedCover: Math.min(100, totalCover),
          weedDetails: weeds
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI Weed Analysis Successful!', type: 'success' } }));
      } else {
        throw new Error('Failed to parse JSON response');
      }
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis failed: ' + err.message, type: 'error' } }));
    } finally {
      setLoading(false);
    }
  };

  // Add / Edit Observation Visit
  const handleSaveVisit = async (e) => {
    e.preventDefault();
    if (!activeSubTrial) return;
    setLoading(true);

    let drivePhotoUrl = visitForm.photoUrl;
    if (visitForm.photoUrl && visitForm.photoUrl.startsWith('data:')) {
      try {
        const fileName = `subtrial_${activeSubTrial.ID}_daa${visitForm.daa}_${Date.now()}.jpg`;
        const res = await uploadPhoto({
          base64: visitForm.photoUrl,
          filename: fileName,
          folderName: activeProject?.Name || 'LargeScale Field Trials'
        }, getAppState);
        if (res && res.url) {
          drivePhotoUrl = res.url;
        }
      } catch (err) {
        console.warn('Drive upload failed, using base64 fallback', err);
      }
    }

    const efficacyData = validateEfficacyData(safeJsonParse(activeSubTrial.EfficacyDataJSON, []));
    const newVisit = {
      daa: Number(visitForm.daa),
      date: visitForm.date,
      weedCover: Number(visitForm.weedCover || 0),
      notes: visitForm.notes,
      weatherTemp: visitForm.weatherTemp,
      weatherHumidity: visitForm.weatherHumidity,
      weatherWind: visitForm.weatherWind,
      weatherRain: visitForm.weatherRain,
      photoUrl: drivePhotoUrl,
      weedDetails: visitForm.weedDetails.length > 0 ? visitForm.weedDetails : [{ species: 'Total Weeds', cover: Number(visitForm.weedCover || 0), status: 'Active' }]
    };

    if (editingVisitIdx !== null) {
      efficacyData[editingVisitIdx] = newVisit;
    } else {
      efficacyData.push(newVisit);
    }

    efficacyData.sort((a, b) => a.daa - b.daa);

    // Update PhotoURLs list to include latest photos
    const photoUrlsList = safeJsonParse(activeSubTrial.PhotoURLs, []);
    if (drivePhotoUrl && !photoUrlsList.some(p => p.url === drivePhotoUrl)) {
      photoUrlsList.push({
        url: drivePhotoUrl,
        date: visitForm.date,
        label: `DAA ${visitForm.daa} Photo`
      });
    }

    // Determine Efficacy Outcome Result
    let resultRating = activeSubTrial.Result || 'Pending';
    if (efficacyData.length > 1) {
      const base = efficacyData[0].weedCover || 100;
      const last = efficacyData[efficacyData.length - 1].weedCover || 0;
      const reduction = base > 0 ? ((base - last) / base) * 100 : 0;
      if (reduction >= 90) resultRating = 'Excellent';
      else if (reduction >= 70) resultRating = 'Good';
      else if (reduction >= 40) resultRating = 'Fair';
      else resultRating = 'Poor';
    }

    const payload = {
      ...activeSubTrial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      PhotoURLs: JSON.stringify(photoUrlsList),
      Result: resultRating,
      UpdatedAt: new Date().toISOString()
    };

    try {
      await updateTrial(payload, getAppState);
      updateState({ trials: state.trials.map(t => t.ID === payload.ID ? payload : t) });
      setIsVisitModalOpen(false);
      setEditingVisitIdx(null);
      setVisitForm(emptyVisitForm());
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'DAA observation log saved!', type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save observation.', type: 'error' } }));
    } finally {
      setLoading(false);
    }
  };

  // Delete Visit
  const handleDeleteVisit = async (idx) => {
    if (!activeSubTrial || !window.confirm('Delete this observation visit record?')) return;
    const efficacyData = validateEfficacyData(safeJsonParse(activeSubTrial.EfficacyDataJSON, []));
    efficacyData.splice(idx, 1);

    const payload = {
      ...activeSubTrial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      UpdatedAt: new Date().toISOString()
    };

    try {
      await updateTrial(payload, getAppState);
      updateState({ trials: state.trials.map(t => t.ID === payload.ID ? payload : t) });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Visit log deleted.', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete visit log.', type: 'error' } }));
    }
  };

  // Master AI report synthesis
  const handleGenerateMasterReport = async () => {
    if (subTrials.length === 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please add sub-trials to synthesize a report.', type: 'error' } }));
      return;
    }
    const keys = getAPIKeys('gemini-3-flash');
    if (!keys.length) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Configure Gemini API key in Settings.', type: 'error' } }));
      return;
    }

    setAiReportRunning(true);
    try {
      // Gather all sub-trial logs into a clean text summary
      const subTrialText = subTrials.map(st => {
        const eff = validateEfficacyData(safeJsonParse(st.EfficacyDataJSON, []));
        const obs = eff.map(o => `DAA ${o.daa}: cover=${o.weedCover}% [${(o.weedDetails || []).map(w => `${w.species} ${w.cover}%`).join(', ')}]`).join('; ');
        return `Sub-trial formulation: ${st.FormulationName}, dosage: ${st.Dosage || 'N/A'}, replication: ${st.Replication}, plot: ${st.PlotNumber || 'N/A'}. History: ${obs}`;
      }).join('\n\n');

      const prompt = `You are an expert agronomist evaluating a large-scale agricultural herbicide field study. Please write a highly professional, comprehensive executive master summary (4-6 paragraphs) synthesizing study outcomes across all monitoring spots/sub-trials:\n\nProject Name: ${activeProject.Name}\nCrop: ${activeProject.Crop || 'N/A'}\nTarget weeds: ${activeProject.TargetWeeds || 'N/A'}\nLocation: ${activeProject.Location || 'N/A'}\n\nSub-Trial Data:\n${subTrialText}\n\nDiscuss: \n1. Overall weed pressure trajectory and general efficacy.\n2. Species-specific outcomes (which weeds were successfully controlled vs which survived/resisted).\n3. Spatial variability (differences across replicates/spots).\n4. Definitive scientific conclusion and recommendation for future applications.`;

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${keys[0]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (!resp.ok) throw new Error(`API returned ${resp.status}`);
      const d = await resp.json();
      const summaryText = d.candidates?.[0]?.content?.parts?.[0]?.text || 'Failed to synthesize narrative summary.';

      // Save AI narrative summary to project document
      const updatedProject = {
        ...activeProject,
        _aiMasterSummary: summaryText,
        _aiSummaryGeneratedAt: new Date().toISOString()
      };
      await addProject(updatedProject, getAppState);
      updateState({ projects: state.projects.map(p => p.ID === activeProjectId ? updatedProject : p) });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Master AI Synthesis Complete!', type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI synthesis failed: ' + err.message, type: 'error' } }));
    } finally {
      setAiReportRunning(false);
    }
  };

  // Comparative charts calculations
  const chartData = useMemo(() => {
    const daaSet = new Set([0]);
    subTrials.forEach(st => {
      const eff = validateEfficacyData(safeJsonParse(st.EfficacyDataJSON, []));
      eff.forEach(o => daaSet.add(o.daa));
    });
    const daas = Array.from(daaSet).sort((a, b) => a - b);

    const datasets = subTrials.map(st => {
      const eff = validateEfficacyData(safeJsonParse(st.EfficacyDataJSON, []));
      const dataPoints = daas.map(daa => {
        const match = eff.find(o => o.daa === daa);
        return match ? match.weedCover : null;
      });
      return {
        label: `${st.FormulationName || 'Spot'} (${st.Replication})`,
        data: dataPoints
      };
    });

    return { daas, datasets };
  }, [subTrials]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 font-sans">
      <TopBar title="Large Scale Field Trials" onMenuClick={onMenuClick} />

      <div className="flex-grow overflow-y-auto p-6 space-y-6">
        {/* Workspace Bar */}
        <div className="backdrop-blur-md bg-white/70 rounded-2xl p-4 border border-white/40 shadow-sm flex flex-wrap gap-4 justify-between items-center">
          <div className="flex items-center gap-3">
            <Compass className="text-emerald-700 h-6 w-6 shrink-0" />
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-extrabold text-emerald-800">Large Scale Workspace</label>
              <select
                value={activeProjectId}
                onChange={e => {
                  setActiveProjectId(e.target.value);
                  setSelectedSubTrialId('');
                }}
                className="bg-transparent border-b border-emerald-800/20 text-slate-800 font-bold focus:outline-none focus:border-emerald-700 pr-4 text-sm"
              >
                <option value="">-- Select Master Project --</option>
                {masterProjects.map(p => <option key={p.ID} value={p.ID}>{p.Name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsProjectModalOpen(true)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Create Master Workspace
            </button>
            {activeProjectId && (
              <button
                onClick={() => {
                  setEditingSubTrial(null);
                  setSubTrialForm({ ...emptySubTrialForm(), InvestigatorName: state.auth?.user?.Name || '' });
                  setIsSubTrialModalOpen(true);
                }}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Add Sub-Trial / Spot
              </button>
            )}
          </div>
        </div>

        {activeProjectId ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left side: Master Dashboard (Map, curves, summaries) */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Dashboard Navigation Tabs */}
              <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit">
                <button
                  onClick={() => setDashboardTab('map')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${dashboardTab === 'map' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <MapIcon className="inline-block w-3.5 h-3.5 mr-1" /> GIS Satellite Map
                </button>
                <button
                  onClick={() => setDashboardTab('charts')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${dashboardTab === 'charts' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <BarChart2 className="inline-block w-3.5 h-3.5 mr-1" /> Efficacy Curves
                </button>
                <button
                  onClick={() => setDashboardTab('ai')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${dashboardTab === 'ai' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Sparkles className="inline-block w-3.5 h-3.5 mr-1" /> Master Report
                </button>
              </div>

              {/* Tab: Map */}
              {dashboardTab === 'map' && (
                <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100 flex flex-col h-[480px] relative">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <span className="font-bold text-slate-700 text-sm flex items-center gap-2">
                      <MapIcon className="w-4 h-4 text-emerald-600" /> Esri Satellite Spatial Coordinates
                    </span>
                    <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {subTrials.length} Monitoring Spots
                    </div>
                  </div>
                  <div ref={mapContainerRef} className="flex-1 w-full h-full bg-slate-50" />
                </div>
              )}

              {/* Tab: Curves */}
              {dashboardTab === 'charts' && (
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 text-base mb-2">Weed Cover Trajectories</h3>
                  <p className="text-xs text-slate-400 mb-6">Compare weed cover reduction rates (%) across different sub-trial zones side-by-side.</p>

                  {chartData.daas.length > 0 && chartData.datasets.length > 0 ? (
                    <div className="h-72 flex flex-col justify-between">
                      <div className="flex-1 relative">
                        <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                          {/* Y-axis lines */}
                          {[0, 20, 40, 60, 80, 100].map(yVal => {
                            const y = 200 - (yVal * 200 / 100);
                            return (
                              <line key={yVal} x1="0" y1={y} x2="500" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                            );
                          })}

                          {/* Data Timelines */}
                          {chartData.datasets.map((ds, dsIdx) => {
                            const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
                            const points = ds.data.map((val, idx) => {
                              if (val === null) return null;
                              const x = (idx / (chartData.daas.length - 1 || 1)) * 500;
                              const y = 200 - (val * 200 / 100);
                              return `${x},${y}`;
                            }).filter(Boolean).join(' ');

                            return (
                              <polyline
                                key={ds.label}
                                fill="none"
                                stroke={colors[dsIdx % colors.length]}
                                strokeWidth="3"
                                points={points}
                              />
                            );
                          })}
                        </svg>
                      </div>

                      {/* X-Axis */}
                      <div className="flex justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {chartData.daas.map(daa => (
                          <span key={daa}>DAA {daa}</span>
                        ))}
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-100">
                        {chartData.datasets.map((ds, dsIdx) => {
                          const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
                          return (
                            <div key={ds.label} className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold">
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[dsIdx % colors.length] }} />
                              <span>{ds.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-slate-400 italic">No historical visits logged yet.</div>
                  )}
                </div>
              )}

              {/* Tab: Master Report & AI Narrative */}
              {dashboardTab === 'ai' && (
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b">
                    <div>
                      <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-violet-600 animate-pulse" /> Master Efficacy Report
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">Unified report synthesizing all Sub-Trial outcomes in the workspace.</p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleGenerateMasterReport}
                        disabled={aiReportRunning}
                        className="px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${aiReportRunning ? 'animate-spin' : ''}`} />
                        {aiReportRunning ? 'Generating...' : 'Synthesize AI Summary'}
                      </button>
                    </div>
                  </div>

                  {/* AI Output */}
                  <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Executive Study Narrative</h4>
                    {activeProject?._aiMasterSummary ? (
                      <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                        {activeProject._aiMasterSummary}
                      </div>
                    ) : (
                      <div className="text-slate-400 italic text-sm py-8 text-center">
                        No narrative summary generated. Click "Synthesize AI Summary" to compile sub-trial findings.
                      </div>
                    )}
                  </div>

                  {/* Export Options */}
                  <div className="pt-4 border-t space-y-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Export Unified Master Study Report</span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                      <button
                        onClick={() => generateMasterComprehensivePdf(activeProject, subTrials, { formulations: state.formulations, aiSummary: activeProject?._aiMasterSummary })}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <FileText className="w-4 h-4 text-emerald-600" /> Comprehensive PDF
                      </button>
                      <button
                        onClick={() => generateMasterScientificReport(activeProject, subTrials, { aiSummary: activeProject?._aiMasterSummary })}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <FileText className="w-4 h-4 text-sky-600" /> Scientific PDF
                      </button>
                      <button
                        onClick={() => generateMasterPpt(activeProject, subTrials)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <BarChart2 className="w-4 h-4 text-amber-600" /> PowerPoint Deck
                      </button>
                      <button
                        onClick={() => exportMasterCSV(activeProject, subTrials)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <TrendingUp className="w-4 h-4 text-purple-600" /> CSV Dataset
                      </button>
                      <button
                        onClick={() => exportMasterHtml(activeProject, subTrials)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <Leaf className="w-4 h-4 text-teal-600" /> Standalone HTML
                      </button>
                      <button
                        onClick={() => exportMasterDocx(activeProject, subTrials)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <BookOpen className="w-4 h-4 text-indigo-600" /> Word Document
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right side: Sub-Trials Folder / Directory & Inspector */}
            <div className="space-y-6">
              {activeSubTrial ? (
                // Inspector View
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-5 flex flex-col max-h-[760px] overflow-hidden">
                  <div className="flex justify-between items-center pb-3 border-b">
                    <button
                      onClick={() => setSelectedSubTrialId('')}
                      className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to Spots
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingSubTrial(activeSubTrial);
                          setSubTrialForm({
                            FormulationName: activeSubTrial.FormulationName || '',
                            InvestigatorName: activeSubTrial.InvestigatorName || '',
                            Date: toDatetimeLocal(activeSubTrial.Date),
                            Location: activeSubTrial.Location || '',
                            Dosage: activeSubTrial.Dosage || '',
                            Lat: activeSubTrial.Lat || '',
                            Lon: activeSubTrial.Lon || '',
                            WeedSpecies: activeSubTrial.WeedSpecies || '',
                            Result: activeSubTrial.Result || 'Pending',
                            Notes: activeSubTrial.Notes || '',
                            Conclusion: activeSubTrial.Conclusion || '',
                            IsControl: activeSubTrial.IsControl === true || activeSubTrial.IsControl === 'true',
                            IsStandardCheck: activeSubTrial.IsStandardCheck === true || activeSubTrial.IsStandardCheck === 'true',
                            IsCompleted: activeSubTrial.IsCompleted === true || activeSubTrial.IsCompleted === 'true',
                            Replication: activeSubTrial.Replication || 'R1',
                            PlotNumber: activeSubTrial.PlotNumber || '',
                            Temperature: activeSubTrial.Temperature || '',
                            Humidity: activeSubTrial.Humidity || '',
                            Windspeed: activeSubTrial.Windspeed || '',
                            Rain: activeSubTrial.Rain || '',
                            SoilPH: activeSubTrial.SoilPH || '',
                            SoilClay: activeSubTrial.SoilClay || '',
                            SoilSand: activeSubTrial.SoilSand || '',
                            SoilOC: activeSubTrial.SoilOC || '',
                            SoilTexture: activeSubTrial.SoilTexture || '',
                            ApplicationTiming: activeSubTrial.ApplicationTiming || 'POST',
                            WeedGrowthStage: activeSubTrial.WeedGrowthStage || 'Vegetative',
                            EfficacyDataJSON: activeSubTrial.EfficacyDataJSON || '[]',
                            PhotoURLs: activeSubTrial.PhotoURLs || '[]',
                            WeedPhotosJSON: activeSubTrial.WeedPhotosJSON || '[]',
                            AISummariesJSON: activeSubTrial.AISummariesJSON || '{}'
                          });
                          setIsSubTrialModalOpen(true);
                        }}
                        className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition"
                        title="Edit Spot"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteSubTrial(activeSubTrial.ID, e)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition"
                        title="Delete Spot"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {/* Identification */}
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">SUB-TRIAL PROFILE</span>
                      <h3 className="text-base font-bold text-slate-800">{activeSubTrial.FormulationName || 'Untreated Check'}</h3>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">
                        Rep: {activeSubTrial.Replication || 'N/A'} | Plot: {activeSubTrial.PlotNumber || 'N/A'}
                      </p>
                    </div>

                    {/* Metadata summary */}
                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block font-semibold">Dosage</span>
                        <span className="font-bold text-slate-700">{activeSubTrial.Dosage || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block font-semibold">Outcome</span>
                        <span className="font-bold text-emerald-800">{activeSubTrial.Result || 'Pending'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block font-semibold">Timing</span>
                        <span className="font-bold text-slate-700">{activeSubTrial.ApplicationTiming || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block font-semibold">Weeds targeted</span>
                        <span className="font-bold text-slate-700 truncate block">{activeSubTrial.WeedSpecies || 'N/A'}</span>
                      </div>
                    </div>

                    {/* Mappin Coordinate */}
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{parseFloat(activeSubTrial.Lat).toFixed(6)}, {parseFloat(activeSubTrial.Lon).toFixed(6)}</span>
                    </div>

                    {/* DAA Observation visits logs */}
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">DAA Visit logs</span>
                        <button
                          onClick={() => {
                            setEditingVisitIdx(null);
                            setVisitForm({ ...emptyVisitForm(), date: new Date().toISOString().split('T')[0] });
                            setIsVisitModalOpen(true);
                          }}
                          className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5"
                        >
                          <Plus className="w-3.5 h-3.5" /> Log DAA Visit
                        </button>
                      </div>

                      <div className="space-y-2">
                        {validateEfficacyData(safeJsonParse(activeSubTrial.EfficacyDataJSON, [])).map((visit, vIdx) => (
                          <div key={vIdx} className="p-3 bg-white border rounded-xl shadow-sm space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[9px]">DAA {visit.daa}</span>
                                <span className="text-slate-400 text-[10px] ml-2">{visit.date}</span>
                              </div>

                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingVisitIdx(vIdx);
                                    setVisitForm({
                                      daa: visit.daa || '',
                                      date: visit.date || '',
                                      weedCover: visit.weedCover || '',
                                      notes: visit.notes || '',
                                      weatherTemp: visit.weatherTemp || '',
                                      weatherHumidity: visit.weatherHumidity || '',
                                      weatherWind: visit.weatherWind || '',
                                      weatherRain: visit.weatherRain || '',
                                      photoUrl: visit.photoUrl || '',
                                      weedDetails: visit.weedDetails || []
                                    });
                                    setIsVisitModalOpen(true);
                                  }}
                                  className="text-[10px] text-slate-500 hover:text-emerald-700 font-semibold"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteVisit(vIdx)}
                                  className="text-[10px] text-red-500 hover:text-red-700 font-semibold"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>

                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">Weed Cover: <b>{visit.weedCover}%</b></span>
                              {visit.photoUrl && (
                                <a href={visit.photoUrl} target="_blank" rel="noopener noreferrer" className="w-10 h-7 rounded overflow-hidden border">
                                  <img src={visit.photoUrl} alt="" className="w-full h-full object-cover" />
                                </a>
                              )}
                            </div>

                            {visit.weedDetails && visit.weedDetails.length > 0 && (
                              <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg space-y-0.5">
                                {visit.weedDetails.map((w, idx) => (
                                  <div key={idx} className="flex justify-between">
                                    <span className="font-medium">{w.species}</span>
                                    <span>{w.cover}% ({w.status || 'Active'})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Export Section */}
                    <div className="pt-4 border-t space-y-2.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Export Sub-Trial Report</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => generateComprehensivePdf(activeSubTrial, { formulations: state.formulations })}
                          className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-600" /> PDF Report
                        </button>
                        <button
                          onClick={() => generateScientificReport(activeSubTrial, { formulations: state.formulations })}
                          className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5 text-sky-600" /> Scientific PDF
                        </button>
                        <button
                          onClick={() => generatePpt(activeSubTrial)}
                          className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1"
                        >
                          <BarChart2 className="w-3.5 h-3.5 text-amber-600" /> PPT Slide
                        </button>
                        <button
                          onClick={() => exportToCSV(activeSubTrial)}
                          className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1"
                        >
                          <TrendingUp className="w-3.5 h-3.5 text-purple-600" /> CSV sheet
                        </button>
                        <button
                          onClick={() => exportHtmlReport(activeSubTrial)}
                          className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1"
                        >
                          <Leaf className="w-3.5 h-3.5 text-teal-600" /> HTML view
                        </button>
                        <button
                          onClick={() => exportTrialDocx(activeSubTrial, { formulations: state.formulations })}
                          className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-indigo-600" /> Word Doc
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Folder List View
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col h-[560px]">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Layers3 className="w-4 h-4 text-emerald-600" /> Sub-Trial Monitoring Spots
                    </h3>
                    <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded">
                      {subTrials.length} Spots Tracked
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                    {subTrials.map(st => {
                      const eff = validateEfficacyData(safeJsonParse(st.EfficacyDataJSON, []));
                      const lastVisitCover = eff.length > 0 ? eff[eff.length - 1].weedCover : 0;
                      return (
                        <div
                          key={st.ID}
                          onClick={() => setSelectedSubTrialId(st.ID)}
                          className="p-3 rounded-xl border border-slate-100 hover:border-emerald-300 transition cursor-pointer flex justify-between items-center bg-slate-50/20"
                        >
                          <div className="space-y-1.5 flex-1 min-w-0 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider">
                                {st.Replication}
                              </span>
                              <span className="font-bold text-slate-800 text-xs truncate max-w-[120px]">{st.FormulationName || 'Untreated Check'}</span>
                              {eff.length > 0 && (
                                <span className="text-slate-400 text-[10px]">DAA {eff[eff.length - 1].daa}</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-semibold truncate flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" /> {st.Location || 'No coord'}
                            </div>
                            <div className="flex flex-wrap gap-2 text-[9px] font-bold text-slate-400">
                              <span>Weed cover: {lastVisitCover}%</span>
                              <span>•</span>
                              <span>Result: {st.Result}</span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      );
                    })}

                    {subTrials.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 italic py-12">
                        <Calendar className="w-8 h-8 text-slate-200 mb-2" />
                        No spots created yet. Click "+ Add Sub-Trial / Spot" to begin tracking.
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
            <h3 className="font-bold text-slate-700 text-lg">No Master Workspace Selected</h3>
            <p className="text-slate-400 text-sm mt-1">Select an existing large field trial workspace or create a new one to begin.</p>
          </div>
        )}
      </div>

      {/* Modal: Create Project Workspace */}
      <Modal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} title="New Master Field Study">
        <form onSubmit={handleSaveProject} className="space-y-4 font-sans text-xs">
          <div>
            <label className="block text-slate-600 font-bold mb-1">Study Workspace Name</label>
            <input
              type="text"
              required
              placeholder="e.g. 50-Acre Soy Herbicide Master Demo"
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
              <label className="block text-slate-600 font-bold mb-1">General Location</label>
              <input
                type="text"
                placeholder="e.g. Sector 4, Northern Farms"
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
            <label className="block text-slate-600 font-bold mb-1">Study boundary coordinates (optional)</label>
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
            Create Master Workspace
          </button>
        </form>
      </Modal>

      {/* Modal: Create / Edit Sub-Trial Spot */}
      <Modal isOpen={isSubTrialModalOpen} onClose={() => setIsSubTrialModalOpen(false)} title={editingSubTrial ? "Edit Sub-Trial Spot" : "New Sub-Trial Spot"}>
        <form onSubmit={handleSaveSubTrial} className="space-y-4 font-sans text-xs max-h-[80vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Treatment Formulation</label>
              <select
                value={subTrialForm.FormulationName}
                onChange={e => setSubTrialForm(p => ({ ...p, FormulationName: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none bg-white text-xs"
              >
                <option value="">-- Choose Formulation --</option>
                {state.formulations?.map(f => <option key={f.ID} value={f.Name}>{f.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Dosage rate</label>
              <input
                type="text"
                placeholder="e.g. 1.5 L/ha"
                value={subTrialForm.Dosage}
                onChange={e => setSubTrialForm(p => ({ ...p, Dosage: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Replication ID</label>
              <input
                type="text"
                placeholder="e.g. R1"
                value={subTrialForm.Replication}
                onChange={e => setSubTrialForm(p => ({ ...p, Replication: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Plot Number</label>
              <input
                type="text"
                placeholder="e.g. 101"
                value={subTrialForm.PlotNumber}
                onChange={e => setSubTrialForm(p => ({ ...p, PlotNumber: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Timing</label>
              <select
                value={subTrialForm.ApplicationTiming}
                onChange={e => setSubTrialForm(p => ({ ...p, ApplicationTiming: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none bg-white text-xs"
              >
                <option value="PRE">PRE</option>
                <option value="E-POST">E-POST</option>
                <option value="POST">POST</option>
                <option value="L-POST">L-POST</option>
              </select>
            </div>
          </div>

          {/* Coordinates Block */}
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
                  value={subTrialForm.Lat}
                  onChange={e => setSubTrialForm(p => ({ ...p, Lat: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500 font-bold">Longitude</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 78.9629"
                  value={subTrialForm.Lon}
                  onChange={e => setSubTrialForm(p => ({ ...p, Lon: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-white border rounded"
                />
              </div>
            </div>
          </div>

          {/* Weather Block */}
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
                  value={subTrialForm.Temperature}
                  onChange={e => setSubTrialForm(p => ({ ...p, Temperature: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Humidity (%)</label>
                <input
                  type="text"
                  value={subTrialForm.Humidity}
                  onChange={e => setSubTrialForm(p => ({ ...p, Humidity: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Wind (km/h)</label>
                <input
                  type="text"
                  value={subTrialForm.Windspeed}
                  onChange={e => setSubTrialForm(p => ({ ...p, Windspeed: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Precip (mm)</label>
                <input
                  type="text"
                  value={subTrialForm.Rain}
                  onChange={e => setSubTrialForm(p => ({ ...p, Rain: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
            </div>
          </div>

          {/* Soil Parameters */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
            <span className="font-bold text-slate-700 text-[10px] uppercase">Soil Characteristics</span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] text-slate-500">Soil pH</label>
                <input
                  type="text"
                  placeholder="e.g. 6.5"
                  value={subTrialForm.SoilPH}
                  onChange={e => setSubTrialForm(p => ({ ...p, SoilPH: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Clay (%)</label>
                <input
                  type="text"
                  placeholder="e.g. 35"
                  value={subTrialForm.SoilClay}
                  onChange={e => setSubTrialForm(p => ({ ...p, SoilClay: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Sand (%)</label>
                <input
                  type="text"
                  placeholder="e.g. 40"
                  value={subTrialForm.SoilSand}
                  onChange={e => setSubTrialForm(p => ({ ...p, SoilSand: e.target.value }))}
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
                  value={subTrialForm.SoilOC}
                  onChange={e => setSubTrialForm(p => ({ ...p, SoilOC: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Soil Texture</label>
                <input
                  type="text"
                  placeholder="e.g. Clay loam"
                  value={subTrialForm.SoilTexture}
                  onChange={e => setSubTrialForm(p => ({ ...p, SoilTexture: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Target Weeds</label>
              <input
                type="text"
                placeholder="e.g. Barnyard Grass"
                value={subTrialForm.WeedSpecies}
                onChange={e => setSubTrialForm(p => ({ ...p, WeedSpecies: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Spot Location Description</label>
              <input
                type="text"
                placeholder="e.g. East Boundary Fence"
                value={subTrialForm.Location}
                onChange={e => setSubTrialForm(p => ({ ...p, Location: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">Investigator Name</label>
            <input
              type="text"
              value={subTrialForm.InvestigatorName}
              onChange={e => setSubTrialForm(p => ({ ...p, InvestigatorName: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">Notes</label>
            <textarea
              placeholder="Spot configuration notes..."
              value={subTrialForm.Notes}
              onChange={e => setSubTrialForm(p => ({ ...p, Notes: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none h-16 text-xs"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 transition"
          >
            Save Spot Configuration
          </button>
        </form>
      </Modal>

      {/* Modal: Log DAA Observation Visit */}
      <Modal isOpen={isVisitModalOpen} onClose={() => setIsVisitModalOpen(false)} title={editingVisitIdx !== null ? "Edit DAA Observation log" : "Log DAA Observation log"}>
        <form onSubmit={handleSaveVisit} className="space-y-4 font-sans text-xs max-h-[80vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Days After Treatment (DAA)</label>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Total Weed Cover (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                required
                placeholder="e.g. 35"
                value={visitForm.weedCover}
                onChange={e => setVisitForm(p => ({ ...p, weedCover: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Visit Weather Parameters</label>
              <button
                type="button"
                onClick={fetchVisitWeather}
                className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg font-bold"
              >
                Sync Weather API
              </button>
            </div>
          </div>

          {/* Visit Weather Preview/Input */}
          <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-xl border">
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
              <label className="text-[9px] text-slate-500">Hum (%)</label>
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
              <label className="text-[9px] text-slate-500">Rain (mm)</label>
              <input
                type="text"
                value={visitForm.weatherRain}
                onChange={e => setVisitForm(p => ({ ...p, weatherRain: e.target.value }))}
                className="w-full px-2 py-1 bg-white border rounded"
              />
            </div>
          </div>

          {/* Photo Capture Section */}
          <div className="space-y-2">
            <span className="font-bold text-slate-700 text-[10px] uppercase block">Field Spot Photo</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="flex-1 py-2.5 border rounded-xl flex items-center justify-center gap-1.5 hover:bg-slate-50 text-xs font-bold text-slate-700"
              >
                <Camera className="w-4 h-4 text-emerald-600" /> Snap from Camera
              </button>

              <label className="flex-1 py-2.5 border rounded-xl flex items-center justify-center gap-1.5 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer text-center">
                <Plus className="w-4 h-4 text-emerald-600" /> Choose File
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            {visitForm.photoUrl && (
              <div className="relative rounded-xl overflow-hidden max-h-48 border bg-black">
                <img src={visitForm.photoUrl} alt="Field Observation" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setVisitForm(prev => ({ ...prev, photoUrl: '' }))}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
                <button
                  type="button"
                  onClick={handleAnalyzePhoto}
                  disabled={loading}
                  className="absolute bottom-2 left-2 right-2 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Sparkles className="w-4 h-4" /> {loading ? 'Analyzing...' : 'Run AI Weed Identification'}
                </button>
              </div>
            )}
          </div>

          {/* Weed Details list */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-slate-600 font-bold">Weed Observations list</label>
              <button
                type="button"
                onClick={() => {
                  setVisitForm(prev => ({
                    ...prev,
                    weedDetails: [...(prev.weedDetails || []), { species: '', cover: '', status: 'Active' }]
                  }));
                }}
                className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Weed
              </button>
            </div>

            <div className="space-y-2">
              {(visitForm.weedDetails || []).map((weed, idx) => (
                <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border">
                  <input
                    type="text"
                    placeholder="Weed species (Scientific/Common)"
                    value={weed.species}
                    onChange={e => {
                      const updated = [...visitForm.weedDetails];
                      updated[idx].species = e.target.value;
                      setVisitForm(prev => ({ ...prev, weedDetails: updated }));
                    }}
                    className="flex-1 px-2.5 py-1.5 bg-white border rounded text-xs"
                  />
                  <input
                    type="number"
                    placeholder="Cover %"
                    value={weed.cover}
                    onChange={e => {
                      const updated = [...visitForm.weedDetails];
                      updated[idx].cover = Number(e.target.value);
                      setVisitForm(prev => ({ ...prev, weedDetails: updated }));
                    }}
                    className="w-16 px-2.5 py-1.5 bg-white border rounded text-xs"
                  />
                  <select
                    value={weed.status}
                    onChange={e => {
                      const updated = [...visitForm.weedDetails];
                      updated[idx].status = e.target.value;
                      setVisitForm(prev => ({ ...prev, weedDetails: updated }));
                    }}
                    className="w-24 px-1 py-1.5 bg-white border rounded text-[11px]"
                  >
                    <option value="Active">Active</option>
                    <option value="Slight Injury">Slight Injury</option>
                    <option value="Moderate Injury">Mod Injury</option>
                    <option value="Severe Injury">Sev Injury</option>
                    <option value="Dead/Desiccated">Dead</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = visitForm.weedDetails.filter((_, i) => i !== idx);
                      setVisitForm(prev => ({ ...prev, weedDetails: updated }));
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">Notes</label>
            <textarea
              placeholder="Visit logs notes..."
              value={visitForm.notes}
              onChange={e => setVisitForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none h-16 text-xs"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 transition"
          >
            Save DAA Visit Log
          </button>
        </form>
      </Modal>

      {/* Camera Modal */}
      {isCameraOpen && (
        <CameraCapture
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onCapture={handleCapturePhoto}
        />
      )}
    </div>
  );
}
