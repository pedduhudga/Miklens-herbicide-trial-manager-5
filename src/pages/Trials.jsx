import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addTrial, deleteTrial, updateTrial } from '../services/db.js';
import {
  Plus, Trash2, Edit, Copy, ChevronRight, Activity, MapPin, Calendar,
  CheckCircle, Camera, Grid, Info, Sparkles, Search, Filter, X,
  FileText, Printer, BarChart3, Eye, CloudRain, Wind, Thermometer,
  Droplets, Image, FolderPlus, FlaskConical, User, Hash, SlidersHorizontal,
  QrCode, BrainCircuit, TrendingDown, Download, RefreshCw, Leaf,
  Navigation, FolderOpen, Lock, Unlock,
  FileDown, Share2, MoreVertical, FileSpreadsheet,
  FileCode, MonitorPlay, Archive, Pencil, ScanLine
} from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { calculateDAA } from '../utils/dateUtils.js';
import { validateEfficacyData } from '../utils/analysisUtils.js';
import CameraCapture from '../components/CameraCapture.jsx';
import GridWeedCoverTool from '../components/GridWeedCoverTool.jsx';
import { analyzePhoto, analyzePhotosBatch } from '../services/multiProviderAI.js';
import TrialCard from '../components/TrialCard.jsx';
import {
  generateComprehensivePdf,
  generateScientificReport,
  generatePpt,
  exportToCSV,
  exportAllTrialsCSV,
  exportJson as exportJsonFile,
  exportFieldReportTxt,
  exportHtmlReport,
  exportTrialDocx,
  shareTrial as shareTrialFn,
} from '../services/trialReports.js';

const RESULT_COLORS = {
  'Excellent': 'bg-emerald-100 text-emerald-700',
  'Good': 'bg-blue-100 text-blue-700',
  'Fair': 'bg-amber-100 text-amber-700',
  'Poor': 'bg-red-100 text-red-700',
  'Control': 'bg-purple-100 text-purple-700',
};

const emptyForm = () => ({
  ProjectID: '', BlockID: '', FormulationName: '', InvestigatorName: '',
  Date: new Date().toISOString().split('T')[0], Location: '', Dosage: '',
  Lat: '', Lon: '',
  WeedSpecies: '', Result: '', Notes: '', Conclusion: '',
  IsControl: false, IsStandardCheck: false, IsCompleted: false,
  ControlFinalized: false, FinalizationDate: '', FinalControlDuration: '',
  Temperature: '', Humidity: '', Windspeed: '', Rain: '',
  Replication: '', PlotNumber: '',
  SoilPH: '', SoilClay: '', SoilSand: '', SoilOC: '', SoilTexture: '',
  YieldValue: '', IsLive: true,
});

export default function Trials({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();

  // --- List view state ---
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [filterFormulation, setFilterFormulation] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState(new Set());

  // --- Add/Edit modal ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrial, setEditingTrial] = useState(null);
  const [formData, setFormData] = useState(emptyForm());

  // --- Detail modal ---
  const [activeTrial, setActiveTrial] = useState(null);
  const [detailTab, setDetailTab] = useState('info');

  // --- Observation modal ---
  const [isObsModalOpen, setIsObsModalOpen] = useState(false);
  const [editingObsIdx, setEditingObsIdx] = useState(null);
  const [obsForm, setObsForm] = useState({ daa: '', date: new Date().toISOString().split('T')[0], weedCover: '', notes: '', weedDetails: [], weatherTemp: '', weatherHumidity: '', weatherWind: '', weatherRain: '' });

  // --- Bulk Edit modal ---
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({ InvestigatorName: '', Location: '', Result: '', Notes: '' });

  // --- Date range filter ---
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');

  // --- GPS fetch ---
  const [gpsFetching, setGpsFetching] = useState(false);

  // --- Export menu ---
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);

  // --- Card 3-dot menus ---
  const [openCardMenu, setOpenCardMenu] = useState(null);

  // --- Photo edit modal ---
  const [photoEditModal, setPhotoEditModal] = useState(null); // { idx, label, date }

  // --- AI single generation ---
  const [aiGenRunning, setAiGenRunning] = useState(false);

  // --- Camera & Grid ---
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState('general');
  const fileInputRef = useRef(null);

  // --- QR Code ---
  const qrCanvasRef = useRef(null);
  const [qrGenerated, setQrGenerated] = useState(false);

  // --- AI Summary ---
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // --- AI weed cover detection ---
  const [detectingCover, setDetectingCover] = useState(false);
  const [coverDetectResult, setCoverDetectResult] = useState(null);
  const obsPhotoRef = useRef(null);

  // --- Weed ID from photo ---
  const [weedIdLoading, setWeedIdLoading] = useState(false);
  const [weedIdResult, setWeedIdResult] = useState(null);
  const weedIdInputRef = useRef(null);

  // --- AI Batch Photo Analysis ---
  const [aiBatchRunning, setAiBatchRunning] = useState(false);
  const [aiBatchProgress, setAiBatchProgress] = useState({ current: 0, total: 0, message: '' });
  const [aiBatchModalOpen, setAiBatchModalOpen] = useState(false);

  // --- Bulk QR Card Print ---
  const [isBulkQrModalOpen, setIsBulkQrModalOpen] = useState(false);
  const [qrCardSize, setQrCardSize] = useState(state.settings?.cardPrintSize || 'id-card');
  const bulkQrRef = useRef(null);

  // ── DERIVED DATA ───────────────────────────────────────────────────
  const trials = state.trials || [];
  const formulations = state.formulations || [];
  const projects = state.projects || [];

  const filteredTrials = useMemo(() => {
    let list = [...trials];
    if (activeTab === 'standard') list = list.filter(t => !t.ProjectID);
    else if (activeTab === 'rcbd') list = list.filter(t => !!t.ProjectID);
    else if (activeTab === 'control') list = list.filter(t => t.IsControl === true || t.IsControl === 'true');
    else if (activeTab === 'finalized') list = list.filter(t => t.IsCompleted === true || t.IsCompleted === 'true');

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        (t.FormulationName || '').toLowerCase().includes(q) ||
        (t.InvestigatorName || '').toLowerCase().includes(q) ||
        (t.Location || '').toLowerCase().includes(q) ||
        (t.WeedSpecies || '').toLowerCase().includes(q) ||
        (t.ID || '').toLowerCase().includes(q)
      );
    }
    if (filterFormulation) list = list.filter(t => t.FormulationID === filterFormulation || t.FormulationName === filterFormulation);
    if (filterResult) list = list.filter(t => (t.Result || '') === filterResult);
    if (filterProject) list = list.filter(t => t.ProjectID === filterProject);

    if (filterDateStart) list = list.filter(t => t.Date && t.Date >= filterDateStart);
    if (filterDateEnd)   list = list.filter(t => t.Date && t.Date <= filterDateEnd);
    list.sort((a, b) => {
      if (sortBy === 'date-desc') return new Date(b.Date || 0) - new Date(a.Date || 0);
      if (sortBy === 'date-asc') return new Date(a.Date || 0) - new Date(b.Date || 0);
      if (sortBy === 'name') return (a.FormulationName || '').localeCompare(b.FormulationName || '');
      if (sortBy === 'obs') return (safeJsonParse(b.EfficacyDataJSON, []).length) - (safeJsonParse(a.EfficacyDataJSON, []).length);
      return 0;
    });
    return list;
  }, [trials, activeTab, search, filterFormulation, filterResult, filterProject, sortBy, filterDateStart, filterDateEnd]);

  // ── CRUD ───────────────────────────────────────────────────────────
  const handleOpenModal = useCallback((trial = null, isDuplicate = false) => {
    setEditingTrial(isDuplicate ? null : trial);
    if (trial) {
      setFormData({
        ProjectID: trial.ProjectID || '', BlockID: trial.BlockID || '',
        FormulationName: isDuplicate ? `${trial.FormulationName} (Copy)` : (trial.FormulationName || ''),
        InvestigatorName: trial.InvestigatorName || '',
        Date: isDuplicate ? new Date().toISOString().split('T')[0] : (trial.Date || ''),
        Location: trial.Location || '', Dosage: trial.Dosage || '',
        Lat: trial.Lat || '', Lon: trial.Lon || '',
        WeedSpecies: trial.WeedSpecies || '', Result: trial.Result || '',
        Notes: trial.Notes || '', Conclusion: trial.Conclusion || '',
        IsControl: trial.IsControl === true || trial.IsControl === 'true',
        IsStandardCheck: trial.IsStandardCheck === true || trial.IsStandardCheck === 'true',
        IsCompleted: isDuplicate ? false : (trial.IsCompleted === true || trial.IsCompleted === 'true'),
        ControlFinalized: isDuplicate ? false : (trial.ControlFinalized === true || trial.ControlFinalized === 'true'),
        FinalizationDate: isDuplicate ? '' : (trial.FinalizationDate || ''),
        FinalControlDuration: isDuplicate ? '' : (trial.FinalControlDuration || ''),
        Temperature: trial.Temperature || '', Humidity: trial.Humidity || '',
        Windspeed: trial.Windspeed || '', Rain: trial.Rain || '',
        Replication: trial.Replication || '', PlotNumber: trial.PlotNumber || '',
        SoilPH: trial.SoilPH || '', SoilClay: trial.SoilClay || '',
        SoilSand: trial.SoilSand || '', SoilOC: trial.SoilOC || '',
        SoilTexture: trial.SoilTexture || '',
      });
    } else {
      setFormData({ ...emptyForm(), InvestigatorName: state.auth?.user?.Name || state.auth?.user?.Username || '' });
    }
    setIsModalOpen(true);
  }, [state.auth?.user?.Name, state.auth?.user?.Username]);

  const fetchGpsWeather = useCallback(async () => {
    if (!navigator.geolocation) return;
    setGpsFetching(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setFormData(prev => ({ ...prev, Lat: lat.toFixed(6), Lon: lon.toFixed(6), Location: prev.Location || `${lat.toFixed(4)}, ${lon.toFixed(4)}` }));
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`);
        const d = await r.json();
        const c = d.current;
        if (c) setFormData(prev => ({
          ...prev,
          Temperature: c.temperature_2m ?? prev.Temperature,
          Humidity: c.relative_humidity_2m ?? prev.Humidity,
          Windspeed: c.wind_speed_10m ?? prev.Windspeed,
          Rain: c.precipitation ?? prev.Rain,
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'GPS & weather synced!', type: 'success' } }));
      } catch { window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Location set, weather fetch failed', type: 'info' } })); }
      setGpsFetching(false);
    }, () => { setGpsFetching(false); window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Location access denied', type: 'error' } })); });
  }, []);

  const handleMoveToProject = async (trial) => {
    const projectList = projects.map((p, i) => `${i + 1}. ${p.Name}`).join('\n');
    const choice = window.prompt(`Move trial to project:\n\n${projectList}\n\nEnter number:`);
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= projects.length) return;
    const updated = { ...trial, ProjectID: projects[idx].ID };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    try {
      await updateTrial({ ID: updated.ID, ProjectID: updated.ProjectID }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Moved to "${projects[idx].Name}"`, type: 'success' } }));
    } catch (e) {}
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const formMatch = formulations.find(f => f.Name === formData.FormulationName);
    const isEdit = !!editingTrial;
    const payload = {
      ...(isEdit ? editingTrial : {}),
      ...formData,
      FormulationID: formMatch?.ID || (isEdit ? editingTrial.FormulationID : ''),
      ...(isEdit ? {} : {
        ID: Date.now().toString(),
        EfficacyDataJSON: '[]', PhotoURLs: '[]', WeedPhotosJSON: '[]',
        CreatedAt: new Date().toISOString(),
      }),
    };

    updateState({ trials: isEdit ? trials.map(t => t.ID === payload.ID ? payload : t) : [...trials, payload] });
    setIsModalOpen(false);

    try {
      if (isEdit) {
        await updateTrial(payload, getAppState);
      } else {
        await addTrial(payload, getAppState);
      }
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Trial ${isEdit ? 'updated' : 'saved'}`, type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save trial', type: 'error' } }));
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this trial?')) return;
    updateState({ trials: trials.filter(t => t.ID !== id) });
    if (activeTrial?.ID === id) setActiveTrial(null);
    try {
      await deleteTrial({ ID: id }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial deleted', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete trial', type: 'error' } }));
    }
  };

  const handleFinalize = async () => {
    if (!activeTrial || !window.confirm('Finalize this trial?')) return;
    const updated = { ...activeTrial, IsCompleted: true };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    try {
      await updateTrial({ ID: updated.ID, IsCompleted: true }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial finalized', type: 'success' } }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to finalize', type: 'error' } }));
    }
  };

  const handleRestart = async () => {
    if (!activeTrial || !window.confirm('Reactivate this trial?')) return;
    const updated = { ...activeTrial, IsCompleted: false };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    try {
      await updateTrial({ ID: updated.ID, IsCompleted: false }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial reactivated', type: 'success' } }));
    } catch (e) {}
  };

  // ── OBSERVATIONS ──────────────────────────────────────────────────
  // ── AI pixel-based weed cover detection (offline-capable) ────────────
  const analyzeWeedCoverFromPixels = useCallback((imageDataUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 800;
          let w = img.width, h = img.height;
          if (w > maxDim) { h = (h / w) * maxDim; w = maxDim; }
          if (h > maxDim) { w = (w / h) * maxDim; h = maxDim; }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          let total = 0, green = 0, brown = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            total++;
            const gli = (2*g - r - b) / (2*g + r + b + 1);
            if (gli > 0.05) { green++; }
            else {
              const max = Math.max(r,g,b), min = Math.min(r,g,b), diff = max - min;
              const h2 = max === 0 ? 0 : max === r ? 60*((g-b)/diff%6) : max === g ? 60*((b-r)/diff+2) : 60*((r-g)/diff+4);
              const s = max === 0 ? 0 : (diff/max)*100, v = max/2.55;
              if (h2 >= 20 && h2 <= 55 && s > 12 && v > 20 && v < 85) brown++;
            }
          }
          const cover = Math.round(((green + brown) / total) * 100);
          resolve({ cover, greenPct: Math.round((green/total)*100), brownPct: Math.round((brown/total)*100), confidence: Math.min(95, 60 + Math.round(total/2000)), source: 'pixel' });
        } catch(e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageDataUrl;
    });
  }, []);

  const detectWeedCoverAI = useCallback(async (imageDataUrl) => {
    setDetectingCover(true);
    setCoverDetectResult(null);
    try {
      const pixelResult = await analyzeWeedCoverFromPixels(imageDataUrl);
      // Try Gemini vision for better accuracy
      const apiKey = state.settings?.geminiApiKey || (state.settings?.geminiApiKeys || state.settings?.apiKeys || [])[0];
      if (apiKey) {
        try {
          const mimeType = imageDataUrl.split(';')[0].split(':')[1];
          const base64 = imageDataUrl.split(',')[1];
          const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [
              { text: 'Analyze this field plot image. Estimate the percentage (0-100) of ground covered by weeds (both green and brown/burnt). Respond with ONLY a number like "45".' },
              { inlineData: { mimeType, data: base64 } }
            ]}] })
          });
          const d = await resp.json();
          const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const m = txt.match(/\d+/);
          if (m) {
            const cover = Math.min(100, Math.max(0, parseInt(m[0])));
            const result = { cover, confidence: 90, source: 'AI (Gemini)', greenPct: pixelResult.greenPct, brownPct: pixelResult.brownPct };
            setCoverDetectResult(result);
            return result;
          }
        } catch(aiErr) {
          console.warn('Gemini vision failed, using pixel fallback:', aiErr.message);
        }
      }
      setCoverDetectResult(pixelResult);
      return pixelResult;
    } catch(e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Cover detection failed: ' + e.message, type: 'error' } }));
      return null;
    } finally {
      setDetectingCover(false);
    }
  }, [state.settings, analyzeWeedCoverFromPixels]);

  // ── Climate risk audit ──────────────────────────────────────────────
  const getClimateRisks = useCallback((temp, wind, rain) => {
    const risks = [];
    const t = parseFloat(temp), w = parseFloat(wind), r = parseFloat(rain);
    if (isFinite(t)) {
      if (t > 30) risks.push({ type: 'warning', msg: `Heat stress risk (${t}°C > 30°C) — may reduce efficacy.` });
      if (t < 5)  risks.push({ type: 'info',    msg: `Cold conditions (${t}°C) — slow herbicide uptake.` });
    }
    if (isFinite(w)) {
      if (w > 15) risks.push({ type: 'danger',  msg: `High wind (${w} km/h) — severe spray drift risk.` });
      else if (w > 10) risks.push({ type: 'warning', msg: `Moderate wind (${w} km/h) — use low-drift nozzles.` });
    }
    if (isFinite(r) && r > 0) risks.push({ type: 'danger', msg: `Rain (${r} mm) — wash-off risk if not rain-fast.` });
    return risks;
  }, []);

  // ── Fetch weather for observation date ─────────────────────────────
  const fetchObsWeather = useCallback(async (date) => {
    if (!activeTrial?.Lat || !activeTrial?.Lon) return;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${activeTrial.Lat}&longitude=${activeTrial.Lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`;
      const r = await fetch(url);
      const d = await r.json();
      const c = d.current;
      if (c) {
        setObsForm(prev => ({ ...prev,
          weatherTemp: c.temperature_2m ?? prev.weatherTemp,
          weatherHumidity: c.relative_humidity_2m ?? prev.weatherHumidity,
          weatherWind: c.wind_speed_10m ?? prev.weatherWind,
          weatherRain: c.precipitation ?? prev.weatherRain,
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather synced for observation', type: 'success' } }));
      }
    } catch(e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather fetch failed', type: 'info' } }));
    }
  }, [activeTrial]);

  // ── Weed ID from photo ─────────────────────────────────────────────
  const identifyWeedFromPhoto = useCallback(async (imageDataUrl) => {
    setWeedIdLoading(true);
    setWeedIdResult(null);
    const apiKey = state.settings?.geminiApiKey || (state.settings?.geminiApiKeys || state.settings?.apiKeys || [])[0];
    if (!apiKey) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Add a Gemini API key in Settings', type: 'error' } }));
      setWeedIdLoading(false);
      return;
    }
    try {
      const mimeType = imageDataUrl.split(';')[0].split(':')[1];
      const base64 = imageDataUrl.split(',')[1];
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [
          { text: 'Identify weed species in this field photo. For each weed, provide: 1) Scientific name, 2) Common name, 3) Estimated cover% of that species in the frame, 4) Growth stage. Format as JSON array: [{"name":"...","commonName":"...","cover":0,"growthStage":"...","confidence":0.0}]. Confidence 0-1.' },
          { inlineData: { mimeType, data: base64 } }
        ]}] })
      });
      const d = await resp.json();
      const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = txt.match(/\[.*\]/s);
      if (jsonMatch) {
        const weeds = JSON.parse(jsonMatch[0]);
        setWeedIdResult(weeds);
      } else {
        setWeedIdResult([{ name: 'Unknown', commonName: txt.slice(0, 120), cover: 0, growthStage: '', confidence: 0.5 }]);
      }
    } catch(e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weed ID failed: ' + e.message, type: 'error' } }));
    } finally {
      setWeedIdLoading(false);
    }
  }, [state.settings]);

  const openObsModal = (idx = null) => {
    if (idx !== null) {
      const obs = validateEfficacyData(safeJsonParse(activeTrial?.EfficacyDataJSON, []))[idx];
      setObsForm({ daa: obs.daa ?? '', date: obs.date || '', weedCover: obs.weedCover ?? '', notes: obs.notes || '', weedDetails: obs.weedDetails || [], weatherTemp: obs.weatherTemp || '', weatherHumidity: obs.weatherHumidity || '', weatherWind: obs.weatherWind || '', weatherRain: obs.weatherRain || '' });
    } else {
      setObsForm({ daa: '', date: new Date().toISOString().split('T')[0], weedCover: '', notes: '', weedDetails: [], weatherTemp: '', weatherHumidity: '', weatherWind: '', weatherRain: '' });
    }
    setCoverDetectResult(null);
    setEditingObsIdx(idx);
    setIsObsModalOpen(true);
  };

  const handleSaveObs = async (e) => {
    e.preventDefault();
    if (!activeTrial) return;
    const efficacyData = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []));
    const newObs = {
      daa: Number(obsForm.daa), date: obsForm.date,
      weedCover: Number(obsForm.weedCover), notes: obsForm.notes,
      weatherTemp: obsForm.weatherTemp, weatherHumidity: obsForm.weatherHumidity,
      weatherWind: obsForm.weatherWind, weatherRain: obsForm.weatherRain,
      weedDetails: obsForm.weedDetails.length > 0 ? obsForm.weedDetails
        : [{ species: 'Total', cover: Number(obsForm.weedCover), status: '', notes: obsForm.notes }],
    };
    if (editingObsIdx !== null) efficacyData[editingObsIdx] = newObs;
    else efficacyData.push(newObs);
    efficacyData.sort((a, b) => a.daa - b.daa);
    const updated = { ...activeTrial, EfficacyDataJSON: JSON.stringify(efficacyData) };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setIsObsModalOpen(false);
    try {
      await updateTrial({ ID: updated.ID, EfficacyDataJSON: updated.EfficacyDataJSON }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Observation saved', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save observation', type: 'error' } }));
    }
  };

  const handleDeleteObs = async (idx) => {
    if (!activeTrial || !window.confirm('Delete this observation?')) return;
    const efficacyData = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []));
    efficacyData.splice(idx, 1);
    const updated = { ...activeTrial, EfficacyDataJSON: JSON.stringify(efficacyData) };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    try { await updateTrial({ ID: updated.ID, EfficacyDataJSON: updated.EfficacyDataJSON }, getAppState); } catch (e) {}
  };

  // Helper for statistics
  const interpretCV = useCallback((cv) => {
    if (!isFinite(cv)) return '';
    if (cv <= 10) return 'Excellent';
    if (cv <= 20) return 'Good';
    if (cv <= 30) return 'Acceptable';
    return 'Poor';
  }, []);

  const calcStats = useCallback(async () => {
    if (!detailTrial) return;
    const efficacy = validateEfficacyData(safeJsonParse(detailTrial.EfficacyDataJSON, []));
    if (efficacy.length < 2) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Need at least 2 observations to calculate statistics', type: 'error' } }));
      return;
    }
    const sorted = [...efficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
    const baseline = sorted[0];
    const baseCover = parseFloat(baseline?.weedCover ?? 100) || 100;
    const wceRows = sorted.map(obs => {
      const cover = parseFloat(obs.weedCover ?? 0) || 0;
      const wce = obs.daa === 0 ? null : (baseCover > 0 ? Math.max(0, Math.min(100, (1 - cover / baseCover) * 100)) : 0);
      const rating = wce === null ? 'Baseline' : wce >= 85 ? 'Excellent' : wce >= 70 ? 'Good' : wce >= 50 ? 'Fair' : 'Poor';
      const sp = (obs.weedDetails || []).map(w => w.species).filter(Boolean).join(', ') || (detailTrial.WeedSpecies || 'Mixed');
      return { species: sp, initialCover: baseCover.toFixed(1), finalCover: cover.toFixed(1), wce: wce !== null ? parseFloat(wce.toFixed(1)) : null, controlRating: rating, daa: obs.daa };
    });
    const wces = wceRows.map(r => r.wce).filter(v => v !== null);
    const meanWce = wces.length ? wces.reduce((s, v) => s + v, 0) / wces.length : 0;
    const ssTreat = wces.reduce((s, v) => s + Math.pow(v - meanWce, 2), 0);
    const df = wces.length - 1;
    const ms = df > 0 ? ssTreat / df : 0;
    const result = {
      wce: wceRows,
      anovaResults: { anovaTable: { treatment: { source: 'Treatment', df, ss: parseFloat(ssTreat.toFixed(2)), ms: parseFloat(ms.toFixed(2)), f: null, p: null, sig: 'N/A' } }, diagnostics: { cv: df > 0 ? parseFloat((100 * Math.sqrt(ms) / (meanWce || 1)).toFixed(2)) : 0, r_squared: df > 0 ? parseFloat((ssTreat / (ssTreat + 0.001)).toFixed(4)) : 0 } },
      calculatedAt: new Date().toISOString()
    };
    const updated = { ...detailTrial, StatisticsJSON: JSON.stringify(result) };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    try { await updateTrial({ ID: updated.ID, StatisticsJSON: updated.StatisticsJSON }, getAppState); } catch(e) {}
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Statistics calculated', type: 'success' } }));
  }, [detailTrial, updateState, trials, getAppState]);

  // Stats data parsing
  const statsData = useMemo(() => {
    const stats = detailTrial?.StatisticsJSON ? (() => { try { return JSON.parse(detailTrial.StatisticsJSON); } catch(e) { return null; } })() : null;
    const hasStats = stats && (stats.wce || stats.anovaResults);
    const renderWces = (stats?.wce || []).map(r => r.wce).filter(v => v !== null && isFinite(v));
    const renderMeanWce = renderWces.length ? renderWces.reduce((s, v) => s + v, 0) / renderWces.length : 0;
    return { stats, hasStats, renderWces, renderMeanWce };
  }, [detailTrial]);

  // ── PHOTOS ────────────────────────────────────────────────────────
  const handleCapturePhoto = async (dataUrl) => {
    if (!activeTrial) return;
    setIsCameraOpen(false);
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Photo captured! Saving...', type: 'info' } }));

    const photoDate = new Date().toISOString();
    const photos = safeJsonParse(activeTrial.PhotoURLs, []);
    photos.push({ fileData: dataUrl, date: photoDate, label: cameraMode === 'weed' ? 'Weed Photo' : 'Field Observation', identifications: [] });
    const updated = { ...activeTrial, PhotoURLs: JSON.stringify(photos) };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);

    try {
      await updateTrial({ ID: updated.ID, PhotoURLs: updated.PhotoURLs }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Photo saved! Starting AI analysis...', type: 'success' } }));

      // AUTO-TRIGGER AI ANALYSIS after capture
      const trialDate = new Date(activeTrial.Date);
      const pDate = new Date(photoDate);
      const daa = Math.max(0, Math.round((pDate.getTime() - trialDate.getTime()) / (1000 * 60 * 60 * 24)));

      const result = await analyzePhoto(dataUrl, {
        treatment: activeTrial.FormulationName,
        daa,
        rep: activeTrial.Replication || 1
      }, (msg) => {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type: 'info' } }));
      });

      if (result.success) {
        await createObservationFromAI(activeTrial, daa, result.data);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `AI complete! Logged ${result.data.weeds?.length || 0} weed species at DAA ${daa}`, type: 'success' } }));
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis skipped: ' + result.error, type: 'warning' } }));
      }
    } catch (e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save photo', type: 'error' } }));
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeTrial) return;
    const reader = new FileReader();
    reader.onload = async (ev) => { await handleCapturePhoto(ev.target.result); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeletePhoto = async (idx) => {
    if (!activeTrial || !window.confirm('Delete this photo?')) return;
    const photos = safeJsonParse(activeTrial.PhotoURLs, []);
    photos.splice(idx, 1);
    const updated = { ...activeTrial, PhotoURLs: JSON.stringify(photos) };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    try { await updateTrial({ ID: updated.ID, PhotoURLs: updated.PhotoURLs }, getAppState); } catch (e) {}
  };

  const handleGridResult = async (coverPct) => {
    if (!activeTrial) return;
    setIsGridOpen(false);
    setObsForm(prev => ({ ...prev, weedCover: coverPct, weedDetails: [{ species: 'Total', cover: coverPct, status: '', notes: 'Measured via grid tool' }] }));
    setEditingObsIdx(null);
    setIsObsModalOpen(true);
  };

  // ── AI PHOTO ANALYSIS ─────────────────────────────────────────────
  const createObservationFromAI = async (trial, daa, aiData) => {
    const efficacyData = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []));

    // Normalize weed data with enhanced fields
    const normalizedWeeds = (aiData.weeds || []).map(w => ({
      species: w.species || 'Unknown',
      cover: typeof w.cover === 'number' ? w.cover : parseFloat(w.cover || 0),
      status: String(w.status || '').trim(),
      growthStage: String(w.growthStage || '').trim(),
      notes: String(w.notes || '').trim()
    }));

    // Calculate total cover - use AI's totalWeedCover if provided, else sum
    const totalWeedCover = typeof aiData.totalWeedCover === 'number'
      ? aiData.totalWeedCover
      : normalizedWeeds.reduce((sum, w) => sum + (w.cover || 0), 0);

    // Build comprehensive notes
    const aiNotes = [];
    if (aiData.efficacyAssessment) aiNotes.push(`Efficacy: ${aiData.efficacyAssessment}`);
    if (aiData.competitionLevel) aiNotes.push(`Weed Pressure: ${aiData.competitionLevel}`);
    if (aiData.dominantSpecies) aiNotes.push(`Dominant: ${aiData.dominantSpecies}`);
    if (aiData.recommendations) aiNotes.push(`Recommendation: ${aiData.recommendations}`);
    if (aiData.notes) aiNotes.push(aiData.notes);

    const newObs = {
      date: new Date().toISOString().split('T')[0],
      daa: Number(daa),
      weedCover: totalWeedCover,
      weedDetails: normalizedWeeds.length > 0 ? normalizedWeeds : [{ species: 'No weeds detected', cover: 0, status: '', notes: aiData.notes || 'AI-analyzed' }],
      notes: aiNotes.join(' | ') || `AI-analyzed on ${new Date().toLocaleDateString()}`,
      aiConfidence: aiData.confidence || 'MEDIUM',
      aiEfficacyAssessment: aiData.efficacyAssessment || '',
      competitionLevel: aiData.competitionLevel || '',
      status: 'Analyzed',
      source: 'AI'
    };

    // Check if observation for this DAA already exists - update if so
    const existingIdx = efficacyData.findIndex(o => o.daa === Number(daa));
    if (existingIdx >= 0) {
      efficacyData[existingIdx] = newObs;
    } else {
      efficacyData.push(newObs);
    }
    efficacyData.sort((a, b) => a.daa - b.daa);

    // Calculate Result field
    let resultValue = 0;
    if (efficacyData.length > 0) {
      const latestObs = [...efficacyData].sort((a, b) => (parseFloat(b.daa) || 0) - (parseFloat(a.daa) || 0))[0];
      resultValue = latestObs.weedCover || 0;
    }

    const updated = {
      ...trial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: String(resultValue.toFixed(2)),
      WeedSpecies: normalizedWeeds.length > 0 ? normalizedWeeds.map(w => w.species).join(', ') : 'No weeds detected'
    };

    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    if (activeTrial?.ID === trial.ID) setActiveTrial(updated);

    try {
      await updateTrial({
        ID: trial.ID,
        EfficacyDataJSON: updated.EfficacyDataJSON,
        Result: updated.Result,
        WeedSpecies: updated.WeedSpecies
      }, getAppState);
    } catch (e) {
      console.error('Failed to save AI observation:', e);
    }
  };

  const handleAnalyzeAllPhotos = async (specificTrial = null) => {
    const targetTrial = specificTrial || activeTrial;
    if (!targetTrial) return;

    // Get all trials for this project (or just the single trial)
    const allTrials = targetTrial.ProjectID
      ? trials.filter(t => t.ProjectID === targetTrial.ProjectID)
      : [targetTrial];

    // Collect all photos with their DAA calculated from photo date vs trial date
    const photosToAnalyze = [];
    const daaCoverageMap = new Map(); // trialId -> Set of DAAs

    allTrials.forEach(trial => {
      const photos = safeJsonParse(trial.PhotoURLs, []);
      const existingObs = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []));
      const existingDAAs = new Set(existingObs.map(o => o.daa));
      daaCoverageMap.set(trial.ID, existingDAAs);

      const trialDate = new Date(trial.Date);

      photos.forEach((photo, idx) => {
        const src = photo.fileData || photo.url || photo;
        if (!src) return;

        // Calculate DAA from photo date
        let daa = 0;
        if (photo.date) {
          const photoDate = new Date(photo.date);
          daa = Math.round((photoDate.getTime() - trialDate.getTime()) / (1000 * 60 * 60 * 24));
          daa = daa >= 0 ? daa : 0;
        }

        photosToAnalyze.push({
          imageData: src,
          trialId: trial.ID,
          treatment: trial.FormulationName,
          daa,
          rep: trial.Replication || 1,
          trialDate: trial.Date,
          photoDate: photo.date
        });
      });
    });

    if (photosToAnalyze.length === 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No photos found to analyze', type: 'warning' } }));
      return;
    }

    // Sort photos by date to process chronologically
    photosToAnalyze.sort((a, b) => new Date(a.photoDate || 0) - new Date(b.photoDate || 0));

    setAiBatchModalOpen(false);
    setAiBatchRunning(true);
    setAiBatchProgress({ current: 0, total: photosToAnalyze.length, message: `Analyzing ${photosToAnalyze.length} photos across ${allTrials.length} trials...` });

    const analyzedDAAs = new Map(); // trialId -> Set of DAAs analyzed

    await analyzePhotosBatch(
      photosToAnalyze,
      ({ current, total, trialId, message }) => {
        setAiBatchProgress({ current, total, message });
      },
      async ({ trialId, daa, data }) => {
        const trial = trials.find(t => t.ID === trialId);
        if (trial) {
          await createObservationFromAI(trial, daa, data);
          if (!analyzedDAAs.has(trialId)) analyzedDAAs.set(trialId, new Set());
          analyzedDAAs.get(trialId).add(daa);
        }
      }
    );

    // Build summary of DAA coverage
    let summaryMsg = `Complete! ${photosToAnalyze.length} photos analyzed.`;
    const coverageDetails = [];
    allTrials.forEach(trial => {
      const prevDAAs = daaCoverageMap.get(trial.ID) || new Set();
      const newDAAs = analyzedDAAs.get(trial.ID) || new Set();
      const addedCount = [...newDAAs].filter(d => !prevDAAs.has(d)).length;
      const allDAAs = new Set([...prevDAAs, ...newDAAs]);
      if (addedCount > 0) {
        coverageDetails.push(`${trial.FormulationName}: ${addedCount} new DAA observations`);
      }
    });

    setAiBatchRunning(false);
    setAiBatchProgress({ current: photosToAnalyze.length, total: photosToAnalyze.length, message: summaryMsg });

    if (coverageDetails.length > 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `${summaryMsg} ${coverageDetails.join(', ')}`, type: 'success' } }));
    } else {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: summaryMsg, type: 'success' } }));
    }

    setTimeout(() => setAiBatchProgress({ current: 0, total: 0, message: '' }), 5000);
  };

  const handleAnalyzeSinglePhoto = async (photoSrc, photoDate) => {
    if (!activeTrial) return;
    const trialDate = new Date(activeTrial.Date);
    let daa = 0;
    if (photoDate) {
      const pd = new Date(photoDate);
      daa = Math.round((pd.getTime() - trialDate.getTime()) / (1000 * 60 * 60 * 24));
      daa = daa >= 0 ? daa : 0;
    }

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Analyzing photo with AI...', type: 'info' } }));
    const result = await analyzePhoto(photoSrc, {
      treatment: activeTrial.FormulationName,
      daa,
      rep: activeTrial.Replication || 1
    });

    if (result.success) {
      await createObservationFromAI(activeTrial, daa, result.data);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `AI analysis complete! Detected ${result.data.weeds?.length || 0} weed species.`, type: 'success' } }));
    } else {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis failed: ' + result.error, type: 'error' } }));
    }
  };

  // ── AI SUMMARY GENERATION ─────────────────────────────────────────
  const generateAISummary = async (trial = activeTrial) => {
    if (!trial) return;
    const efficacyData = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []));
    if (efficacyData.length < 2) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Need at least 2 observations to generate summary', type: 'warning' } }));
      return;
    }

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating AI trial summary...', type: 'info' } }));

    const sorted = [...efficacyData].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
    const baseline = sorted[0];
    const latest = sorted[sorted.length - 1];
    const baseCover = parseFloat(baseline?.weedCover ?? 100) || 100;
    const finalCover = parseFloat(latest?.weedCover ?? 0) || 0;
    const wce = baseCover > 0 ? Math.max(0, Math.min(100, (1 - finalCover / baseCover) * 100)) : 0;

    // Collect all unique weed species across all observations
    const allSpecies = new Set();
    const speciesControlStatus = {};
    sorted.forEach(obs => {
      (obs.weedDetails || []).forEach(wd => {
        allSpecies.add(wd.species);
        if (!speciesControlStatus[wd.species]) {
          speciesControlStatus[wd.species] = { initial: wd.cover, final: wd.cover, status: wd.status };
        } else {
          speciesControlStatus[wd.species].final = wd.cover;
          speciesControlStatus[wd.species].status = wd.status;
        }
      });
    });

    // Build summary text
    const daysTracked = latest.daa - baseline.daa;
    const controlRating = wce >= 85 ? 'Excellent' : wce >= 70 ? 'Good' : wce >= 50 ? 'Fair' : 'Poor';

    let summaryText = `**Weed Control Summary**\\n`;
    summaryText += `Treatment: ${trial.FormulationName || 'Unknown'}\\n`;
    summaryText += `Duration: ${daysTracked} days (DAA ${baseline.daa} to ${latest.daa})\\n`;
    summaryText += `Initial Cover: ${baseCover.toFixed(1)}% → Final Cover: ${finalCover.toFixed(1)}%\\n`;
    summaryText += `Weed Control Efficiency (WCE): ${wce.toFixed(1)}% - ${controlRating} Control\\n\\n`;

    summaryText += `**Species Observed:** ${Array.from(allSpecies).join(', ') || 'None identified'}\\n`;
    summaryText += `**Control Status by Species:**\\n`;
    Object.entries(speciesControlStatus).forEach(([sp, data]) => {
      const spWCE = data.initial > 0 ? ((1 - data.final / data.initial) * 100).toFixed(0) : 0;
      summaryText += `- ${sp}: ${data.initial}% → ${data.final}% (WCE: ${spWCE}%, Status: ${data.status || 'Unknown'})\\n`;
    });

    summaryText += `\\n**Conclusion:** `;
    if (wce >= 85) {
      summaryText += `The treatment demonstrated excellent weed control efficacy with sustained suppression throughout the trial period.`;
    } else if (wce >= 70) {
      summaryText += `The treatment provided good weed control with significant reduction in weed pressure. Continued monitoring recommended.`;
    } else if (wce >= 50) {
      summaryText += `Moderate control observed. Consider reapplication or tank-mix options for improved efficacy.`;
    } else {
      summaryText += `Limited control observed. Review application timing, rate, or consider alternative chemistry.`;
    }

    // Update trial with AI-generated conclusion
    const updated = { ...trial, Conclusion: summaryText };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    if (activeTrial?.ID === trial.ID) setActiveTrial(updated);

    try {
      await updateTrial({ ID: trial.ID, Conclusion: summaryText }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI summary generated and saved to Conclusions', type: 'success' } }));
    } catch (e) {
      console.error('Failed to save AI summary:', e);
    }
  };

  // ── BULK SELECT ───────────────────────────────────────────────────
  const toggleBulk = (id) => setSelectedForBulk(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearBulk = () => setSelectedForBulk(new Set());
  const navigateToCompare = () => {
    updateState({ selectedTrials: trials.filter(t => selectedForBulk.has(t.ID)) });
    window.location.hash = '/compare';
    clearBulk();
  };
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedForBulk.size} trial(s)?`)) return;
    const ids = Array.from(selectedForBulk);
    updateState({ trials: trials.filter(t => !ids.includes(t.ID)) });
    clearBulk();
    for (const id of ids) { try { await deleteTrial({ ID: id }, getAppState); } catch (e) {} }
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `${ids.length} trial(s) deleted`, type: 'success' } }));
  };

  // ── BULK QR CARD PRINT ────────────────────────────────────────────
  const generateBulkQrCards = () => {
    const selectedTrials = trials.filter(t => selectedForBulk.has(t.ID));
    if (selectedTrials.length === 0) return;

    const sizeConfig = {
      'id-card': { width: '85mm', height: '54mm', cols: 2, qrSize: 120, fontSize: '10px' },
      'a6': { width: '148mm', height: '105mm', cols: 1, qrSize: 180, fontSize: '12px' },
      'a4': { width: '210mm', height: '297mm', cols: 2, qrSize: 200, fontSize: '14px' },
    };
    const config = sizeConfig[qrCardSize] || sizeConfig['id-card'];

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please allow popups to print QR cards', type: 'error' } }));
      return;
    }

    const cardsHtml = selectedTrials.map(trial => {
      const qrData = JSON.stringify({
        trialId: trial.ID,
        name: trial.FormulationName,
        location: trial.Location,
        date: trial.Date,
        investigator: trial.InvestigatorName
      });
      return `
        <div class="qr-card" style="
          width: ${config.width};
          height: ${config.height};
          border: 2px solid #0d9488;
          border-radius: 12px;
          padding: 12px;
          margin: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          page-break-inside: avoid;
        ">
          <div style="font-size: ${config.fontSize}; font-weight: bold; color: #0d9488; margin-bottom: 6px; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${trial.FormulationName || 'Trial'}
          </div>
          <div id="qr-${trial.ID}" style="margin: 4px 0;"></div>
          <div style="font-size: ${config.fontSize}; color: #64748b; text-align: center; line-height: 1.3;">
            <div>${trial.Location || 'No location'}</div>
            <div>${trial.Date ? new Date(trial.Date).toLocaleDateString() : ''}</div>
            <div style="font-size: 9px; color: #94a3b8; margin-top: 4px;">ID: ${trial.ID.slice(-8)}</div>
          </div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Trial Cards</title>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
          <style>
            @media print {
              body { margin: 0; padding: 0; }
              .no-print { display: none; }
              .qr-card { break-inside: avoid; }
            }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              background: #f8fafc;
              margin: 0;
              padding: 20px;
            }
            .controls {
              text-align: center;
              padding: 20px;
              background: white;
              border-radius: 12px;
              margin-bottom: 20px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .print-btn {
              background: #0d9488;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-size: 16px;
              cursor: pointer;
            }
            .print-btn:hover { background: #0f766e; }
            .cards-container {
              display: flex;
              flex-wrap: wrap;
              justify-content: center;
            }
          </style>
        </head>
        <body>
          <div class="controls no-print">
            <h2>QR Trial Cards (${selectedTrials.length} cards)</h2>
            <p>Size: ${qrCardSize.toUpperCase()} | Cards will print on separate pages</p>
            <button class="print-btn" onclick="window.print()">Print Cards</button>
          </div>
          <div class="cards-container">
            ${cardsHtml}
          </div>
          <script>
            window.onload = function() {
              ${selectedTrials.map(t => `
                new QRCode(document.getElementById('qr-${t.ID}'), {
                  text: '${JSON.stringify({
                    trialId: t.ID,
                    name: t.FormulationName,
                    location: t.Location,
                    date: t.Date
                  }).replace(/'/g, "\\'")}',
                  width: ${config.qrSize},
                  height: ${config.qrSize},
                  colorDark: '#0d9488',
                  colorLight: '#ffffff',
                  correctLevel: QRCode.CorrectLevel.M
                });
              `).join('')}
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ── RESULT BADGE ──────────────────────────────────────────────────
  const ResultBadge = ({ result }) => {
    if (!result) return null;
    const cls = RESULT_COLORS[result] || 'bg-slate-100 text-slate-600';
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{result}</span>;
  };

  // ── TRIAL CARD HANDLERS ───────────────────────────────────────────
  const handleToggleMenu = useCallback((id) => {
    setOpenCardMenu(v => v === id ? null : id);
  }, []);

  const handleViewDetails = useCallback((trial) => {
    setActiveTrial(trial);
    setDetailTab('info');
  }, []);

  const handleDuplicate = useCallback((trial) => {
    handleOpenModal(trial, true);
  }, [handleOpenModal]);

  const handleActivateToggle = useCallback(async (trial) => {
    const updated = { ...trial, IsLive: String(trial.IsLive) !== 'false' ? false : true };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    try { await updateTrial({ ID: updated.ID, IsLive: updated.IsLive }, getAppState); } catch(e) {}
  }, [trials, updateState, getAppState]);

  // Memoized project lookup for TrialCard
  const projectMap = useMemo(() => {
    const map = {};
    projects.forEach(p => { map[p.ID] = p; });
    return map;
  }, [projects]);

  // ── TABS ──────────────────────────────────────────────────────────
  const tabCounts = useMemo(() => ({
    all: trials.length,
    standard: trials.filter(t => !t.ProjectID).length,
    rcbd: trials.filter(t => !!t.ProjectID).length,
    control: trials.filter(t => t.IsControl === true || t.IsControl === 'true').length,
    finalized: trials.filter(t => t.IsCompleted === true || t.IsCompleted === 'true').length,
  }), [trials]);

  // ── DETAIL TRIAL DERIVATIONS (must be before useCallbacks that use them) ───
  const detailTrial = activeTrial ? (trials.find(t => t.ID === activeTrial.ID) || activeTrial) : null;
  const detailEfficacy = detailTrial ? validateEfficacyData(safeJsonParse(detailTrial.EfficacyDataJSON, [])) : [];
  const detailPhotos = detailTrial ? safeJsonParse(detailTrial.PhotoURLs, []) : [];
  const detailIsCompleted = detailTrial?.IsCompleted === true || detailTrial?.IsCompleted === 'true';

  // DAA coverage analysis for photos/observations
  const daaCoverage = useMemo(() => {
    if (!activeTrial) return { allDAAs: [], obsDAAs: [], photoDAAs: [], hasGaps: false };
    const obs = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []));
    const photoDates = detailPhotos.map(p => p.date ? new Date(p.date) : null).filter(Boolean);
    const trialDate = activeTrial.Date ? new Date(activeTrial.Date) : null;
    const photoDAAs = trialDate ? photoDates.map(pd => Math.max(0, Math.round((pd.getTime() - trialDate.getTime()) / (1000 * 60 * 60 * 24)))) : [];
    const obsDAAs = obs.map(o => o.daa).filter(d => d !== undefined && d !== null);
    const allDAAs = [...new Set([...obsDAAs, ...photoDAAs])].sort((a, b) => a - b);
    const maxDAA = allDAAs.length > 0 ? Math.max(...allDAAs) : 0;
    const hasGaps = maxDAA > 0 && allDAAs.length < maxDAA + 1;
    return { allDAAs, obsDAAs: [...new Set(obsDAAs)], photoDAAs: [...new Set(photoDAAs)], hasGaps };
  }, [activeTrial, detailPhotos]);

  // Chart data computation
  const chartDataComputed = useMemo(() => {
    const chartData = detailEfficacy.filter(o => o.daa !== undefined);
    if (chartData.length === 0) return null;
    const maxDaa = Math.max(...chartData.map(o => o.daa));
    const maxCover = Math.max(...chartData.map(o => o.weedCover ?? 0), 10);
    const baseCover = chartData[0]?.weedCover ?? 0;
    const W = 340, H = 180, PX = 40, PY = 20, PB = 30;
    const cx = d => PX + (d / (maxDaa || 1)) * (W - PX - 16);
    const cy = v => PY + (1 - (v / maxCover)) * (H - PY - PB);
    const pts = chartData.map(o => `${cx(o.daa)},${cy(o.weedCover ?? 0)}`).join(' ');
    const wcePts = baseCover > 0 ? chartData.map(o => `${cx(o.daa)},${cy((1 - (o.weedCover ?? 0) / baseCover) * maxCover)}`).join(' ') : null;
    const lastWce = baseCover > 0 ? Math.round((1 - ((chartData[chartData.length-1]?.weedCover ?? 0) / baseCover)) * 100) : null;
    return { chartData, maxDaa, maxCover, baseCover, W, H, PX, PY, PB, cx, cy, pts, wcePts, lastWce };
  }, [detailEfficacy]);

  // ── QR CODE GENERATOR ─────────────────────────────────────────────
  const generateQR = useCallback(async (trial) => {
    if (!trial || !qrCanvasRef.current) return;
    setQrGenerated(false);
    const canvas = qrCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const size = 200;
    canvas.width = size;
    canvas.height = size;
    // Build QR data payload
    const qrFields = state.settings?.qrCodeFields || {};
    const payload = { ID: trial.ID };
    if (qrFields.FormulationName !== false) payload.FormulationName = trial.FormulationName;
    if (qrFields.InvestigatorName !== false) payload.InvestigatorName = trial.InvestigatorName;
    if (qrFields.Date !== false) payload.Date = trial.Date;
    if (qrFields.Dosage !== false) payload.Dosage = trial.Dosage;
    if (qrFields.Location) payload.Location = trial.Location;
    const qrText = JSON.stringify(payload);
    try {
      // Use jsQR-compatible encoding via QRCode library if available, else use canvas text fallback
      if (window.QRCode) {
        const div = document.createElement('div');
        new window.QRCode(div, { text: qrText, width: size, height: size, colorDark: '#1e293b', colorLight: '#ffffff' });
        setTimeout(() => {
          const img = div.querySelector('img') || div.querySelector('canvas');
          if (img) {
            const tempImg = new window.Image();
            tempImg.onload = () => { ctx.drawImage(tempImg, 0, 0, size, size); setQrGenerated(true); };
            tempImg.src = img.src || img.toDataURL();
          }
        }, 200);
      } else {
        // Fallback: draw a placeholder with the ID text
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('QR Code', size / 2, size / 2 - 10);
        ctx.font = '9px monospace';
        ctx.fillText(trial.ID, size / 2, size / 2 + 10);
        ctx.fillText('(QRCode.js not loaded)', size / 2, size / 2 + 28);
        setQrGenerated(true);
      }
    } catch (e) { console.error('QR gen error', e); }
  }, [state.settings, qrCanvasRef]);

  const downloadQR = useCallback(() => {
    if (!qrCanvasRef.current) return;
    const a = document.createElement('a');
    a.download = `QR_${detailTrial?.FormulationName || 'trial'}.png`;
    a.href = qrCanvasRef.current.toDataURL('image/png');
    a.click();
  }, []);

  // ── AI SUMMARY GENERATOR ──────────────────────────────────────────
  const generateAiSummary = useCallback(async () => {
    if (!detailTrial) return;
    const apiKey = state.settings?.apiKeys?.[0];
    if (!apiKey) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No Gemini API key configured in Settings', type: 'error' } }));
      return;
    }
    setAiLoading(true);
    setAiSummary('');
    try {
      const efficacy = validateEfficacyData(safeJsonParse(detailTrial.EfficacyDataJSON, []));
      const obsSummary = efficacy.map(o => `DAA ${o.daa}: ${o.weedCover}% cover`).join(', ');
      const prompt = `Summarize this herbicide trial result in 3-4 sentences for an agronomist report.
Trial: ${detailTrial.FormulationName}
Date: ${detailTrial.Date}, Location: ${detailTrial.Location || 'N/A'}
Dosage: ${detailTrial.Dosage || 'N/A'}
Weed species: ${detailTrial.WeedSpecies || 'N/A'}
Observations: ${obsSummary || 'No data'}
Overall result: ${detailTrial.Result || 'Not rated'}
Conclusion: ${detailTrial.Conclusion || ''}
Write a professional, concise narrative summary.`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) throw new Error('Empty AI response');
      setAiSummary(text);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `AI error: ${err.message}`, type: 'error' } }));
    } finally {
      setAiLoading(false);
    }
  }, [detailTrial, state.settings]);

  // Reset AI summary when active trial changes
  useEffect(() => { setAiSummary(''); setQrGenerated(false); setExportMenuOpen(false); }, [activeTrial?.ID]);

  // Close export menu on outside click
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e) => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setExportMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportMenuOpen]);

  // Close card menus on outside click
  useEffect(() => {
    if (!openCardMenu) return;
    const handler = () => setOpenCardMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openCardMenu]);

  // ── EXPORT FUNCTIONS (delegated to trialReports.js service) ─────────
  const exportTxtReport     = useCallback((trial) => { const proj = projects.find(p => p.ID === trial.ProjectID); exportFieldReportTxt(trial, proj?.Name || ''); }, [projects]);
  const exportCsv           = useCallback((trial) => exportToCSV(trial), []);
  const exportJson          = useCallback((trial) => exportJsonFile(trial), []);
  const exportHtmlSlide     = useCallback((trial) => { const proj = projects.find(p => p.ID === trial.ProjectID); exportHtmlReport(trial, proj?.Name || ''); }, [projects]);
  const exportAllCsv        = useCallback(() => exportAllTrialsCSV(trials, projects), [trials, projects]);
  const shareTrial          = useCallback((trial) => shareTrialFn(trial), []);
  // PDF variants — matching legacy buttons exactly
  const handleExportPdf          = useCallback((trial, opts = {}) => generateComprehensivePdf(trial, { withIngredients: true,  withWeeds: false, withTimeline: false, ...opts, formulations: state.formulations || [] }), [state.formulations]);
  const handleExportPdfNoIng     = useCallback((trial, opts = {}) => generateComprehensivePdf(trial, { withIngredients: false, withWeeds: false, withTimeline: false, ...opts, formulations: state.formulations || [] }), [state.formulations]);
  const handleExportPdfWeedsIng  = useCallback((trial, opts = {}) => generateComprehensivePdf(trial, { withIngredients: true,  withWeeds: true,  withTimeline: false, ...opts, formulations: state.formulations || [] }), [state.formulations]);
  const handleExportPdfWeeds     = useCallback((trial, opts = {}) => generateComprehensivePdf(trial, { withIngredients: false, withWeeds: true,  withTimeline: false, ...opts, formulations: state.formulations || [] }), [state.formulations]);
  const handleExportFullNoIng    = useCallback((trial, opts = {}) => generateComprehensivePdf(trial, { withIngredients: false, withWeeds: true,  withTimeline: true,  ...opts, formulations: state.formulations || [] }), [state.formulations]);
  const handleExportFullIng      = useCallback((trial, opts = {}) => generateComprehensivePdf(trial, { withIngredients: true,  withWeeds: true,  withTimeline: true,  ...opts, formulations: state.formulations || [] }), [state.formulations]);
  // Scientific PDF variants
  const handleExportSciPdf       = useCallback((trial, opts = {}) => { const aiSummary = safeJsonParse(trial.AISummariesJSON, {}).cover || ''; generateScientificReport(trial, { withIngredients: false, aiSummary, ...opts, formulations: state.formulations || [] }); }, [state.formulations]);
  const handleExportSciPdfIng    = useCallback((trial, opts = {}) => { const aiSummary = safeJsonParse(trial.AISummariesJSON, {}).cover || ''; generateScientificReport(trial, { withIngredients: true,  aiSummary, ...opts, formulations: state.formulations || [] }); }, [state.formulations]);
  // DOC variants
  const handleExportDocNoIng     = useCallback((trial) => exportTrialDocx(trial, { withIngredients: false, withWeeds: true,  formulations: state.formulations || [] }), [state.formulations]);
  const handleExportDocIng       = useCallback((trial) => exportTrialDocx(trial, { withIngredients: true,  withWeeds: true,  formulations: state.formulations || [] }), [state.formulations]);
  // PPT
  const handleExportPpt          = useCallback((trial) => generatePpt(trial), []);

  const handleAiSingleGenerate = useCallback(async (trial) => {
    const apiKey = state.settings?.apiKeys?.[0];
    if (!apiKey) { window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Add a Gemini API key in Settings first', type: 'error' } })); return; }
    const efficacy = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []));
    if (efficacy.length === 0) { window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No observations to analyze. Log observations first.', type: 'error' } })); return; }
    setAiGenRunning(true);
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Generating AI efficacy report for ${trial.FormulationName}...`, type: 'info' } }));
    try {
      const weedSpecies = [...new Set(efficacy.flatMap(o => (o.weedDetails||[]).map(w=>w.species).filter(Boolean)))];
      const obsText = efficacy.map(o => `DAA ${o.daa}: cover=${o.weedCover}% [${(o.weedDetails||[]).map(w=>`${w.species} ${w.cover}% ${w.status}`).join(', ')}]`).join('; ');
      const prompt = `You are an expert agricultural scientist. Write a concise scientific narrative (3-5 paragraphs) for this herbicide efficacy trial:\n\nFormulation: ${trial.FormulationName}\nDosage: ${trial.Dosage}\nTarget Weeds: ${trial.WeedSpecies}\nLocation: ${trial.Location}\nDate Applied: ${trial.Date}\nResult Rating: ${trial.Result}\nObservations: ${obsText}\nWeather: Temp ${trial.Temperature}°C, Humidity ${trial.Humidity}%, Wind ${trial.Windspeed} km/h\n\nAddress: initial cover, response trajectory, final efficacy, species-specific outcomes, and recommendation.`;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }) });
      const d = await r.json();
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
      const summaries = { cover: text, generatedAt: new Date().toISOString() };
      const updated = { ...trial, AISummariesJSON: JSON.stringify(summaries) };
      updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
      if (activeTrial?.ID === updated.ID) setActiveTrial(updated);
      try { await updateTrial({ ID: updated.ID, AISummariesJSON: updated.AISummariesJSON }, getAppState); } catch(e) {}
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI report saved!', type: 'success' } }));
      setDetailTab('ai');
    } catch(err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI generation failed: ' + err.message, type: 'error' } }));
    } finally { setAiGenRunning(false); }
  }, [state.settings, trials, activeTrial, updateState, getAppState]);

  const handleSavePhotoEdit = useCallback(async () => {
    if (!activeTrial || !photoEditModal) return;
    const photos = safeJsonParse(activeTrial.PhotoURLs, []);
    photos[photoEditModal.idx] = { ...photos[photoEditModal.idx], label: photoEditModal.label, date: photoEditModal.date };
    const updated = { ...activeTrial, PhotoURLs: JSON.stringify(photos) };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setPhotoEditModal(null);
    try { await updateTrial({ ID: updated.ID, PhotoURLs: updated.PhotoURLs }, getAppState); } catch(e) {}
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Photo updated', type: 'success' } }));
  }, [activeTrial, photoEditModal, trials, updateState, getAppState]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TopBar title="Trials" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto">
        {/* ── TOOLBAR ── */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-100 px-4 py-3 space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search trials..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              />
              {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
            </div>
            <button onClick={() => setShowFilters(v => !v)} className={`p-2 rounded-lg border transition ${showFilters ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button onClick={exportAllCsv} title="Export all trials to CSV" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition">
              <FileDown className="w-4 h-4" />
            </button>
            <button onClick={() => handleOpenModal()} className="btn-primary text-white px-4 py-2 rounded-lg flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap">
              <Plus className="w-4 h-4" /> New Trial
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pb-1">
              <select value={filterFormulation} onChange={e => setFilterFormulation(e.target.value)} className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">All Formulations</option>
                {formulations.map(f => <option key={f.ID} value={f.Name}>{f.Name}</option>)}
              </select>
              <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.ID} value={p.ID}>{p.Name}</option>)}
              </select>
              <select value={filterResult} onChange={e => setFilterResult(e.target.value)} className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">All Results</option>
                {['Excellent', 'Good', 'Fair', 'Poor', 'Control'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="name">By Formulation</option>
                <option value="obs">Most Observations</option>
              </select>
              <div className="col-span-2 flex gap-2 items-center">
                <span className="text-xs font-semibold text-slate-500 shrink-0">From</span>
                <input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <span className="text-xs font-semibold text-slate-500 shrink-0">To</span>
                <input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <button onClick={() => { setSearch(''); setFilterFormulation(''); setFilterResult(''); setFilterProject(''); setFilterDateStart(''); setFilterDateEnd(''); setSortBy('date-desc'); }}
                className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-1.5 hover:bg-red-100">Reset Filters</button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {[['all','All'],['standard','Standard'],['rcbd','RCBD'],['control','Control'],['finalized','Finalized']].map(([k,label]) => (
              <button key={k} onClick={() => setActiveTab(k)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition
                  ${activeTab === k ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {label} <span className="ml-1 opacity-70">({tabCounts[k]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── GRID ── */}
        <div className="p-4">
          {filteredTrials.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredTrials.map(t => (
                <TrialCard
                  key={t.ID}
                  trial={t}
                  project={projectMap[t.ProjectID]}
                  isSelected={selectedForBulk.has(t.ID)}
                  isMenuOpen={openCardMenu === t.ID}
                  onToggleBulk={toggleBulk}
                  onToggleMenu={handleToggleMenu}
                  onViewDetails={handleViewDetails}
                  onEdit={handleOpenModal}
                  onDuplicate={handleDuplicate}
                  onMoveToProject={handleMoveToProject}
                  onExportPdf={handleExportPdf}
                  onExportSciPdf={handleExportSciPdf}
                  onExportPpt={handleExportPpt}
                  onExportHtml={exportHtmlSlide}
                  onExportTxt={exportTxtReport}
                  onExportCsv={exportCsv}
                  onExportJson={exportJson}
                  onShare={shareTrial}
                  onAiGenerate={handleAiSingleGenerate}
                  onDelete={handleDelete}
                  onActivateToggle={handleActivateToggle}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Activity className="w-12 h-12 mb-4 opacity-30" />
              <p className="font-semibold">No trials found</p>
              <p className="text-sm mt-1">{search || filterFormulation || filterResult ? 'Try adjusting your filters' : 'Create your first trial to get started'}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── SELECTION BAR ── */}
      {selectedForBulk.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-4 z-50">
          <span className="font-bold text-sm"><span className="bg-emerald-500 px-2 py-0.5 rounded-full mr-2">{selectedForBulk.size}</span>Selected</span>
          <div className="h-4 w-px bg-slate-600" />
          <button onClick={navigateToCompare} className="flex items-center gap-1.5 text-sm hover:text-emerald-400 transition"><BarChart3 className="w-4 h-4" />Compare</button>
          <button onClick={() => setIsBulkEditOpen(true)} className="flex items-center gap-1.5 text-sm hover:text-amber-400 transition"><Edit className="w-4 h-4" />Bulk Edit</button>
          <button onClick={() => setIsBulkQrModalOpen(true)} className="flex items-center gap-1.5 text-sm hover:text-blue-400 transition"><Printer className="w-4 h-4" />Print Cards</button>
          <button onClick={() => { const sel = trials.filter(t => selectedForBulk.has(t.ID)); sel.forEach(t => exportCsv(t)); }} className="flex items-center gap-1.5 text-sm hover:text-emerald-400 transition"><FileSpreadsheet className="w-4 h-4" />Export CSV</button>
          <button onClick={handleBulkDelete} className="flex items-center gap-1.5 text-sm hover:text-red-400 transition"><Trash2 className="w-4 h-4" />Delete</button>
          <button onClick={clearBulk} className="ml-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── BULK EDIT MODAL ── */}
      {isBulkEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Edit className="w-5 h-5 text-amber-500" />Bulk Edit <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full text-sm">{selectedForBulk.size} trials</span></h3>
              <button onClick={() => setIsBulkEditOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 border">Leave any field blank to keep existing values unchanged.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Investigator Name</label>
                <input type="text" value={bulkEditForm.InvestigatorName} onChange={e => setBulkEditForm(p => ({...p, InvestigatorName: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Leave blank to keep existing" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Location</label>
                <input type="text" value={bulkEditForm.Location} onChange={e => setBulkEditForm(p => ({...p, Location: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Leave blank to keep existing" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Result</label>
                <select value={bulkEditForm.Result} onChange={e => setBulkEditForm(p => ({...p, Result: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="">-- No Change --</option>
                  {['Excellent','Good','Fair','Poor','Control'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Append to Notes</label>
                <textarea rows={2} value={bulkEditForm.Notes} onChange={e => setBulkEditForm(p => ({...p, Notes: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Text will be appended to existing notes" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button onClick={() => setIsBulkEditOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
              <button onClick={async () => {
                const updates = {};
                if (bulkEditForm.InvestigatorName.trim()) updates.InvestigatorName = bulkEditForm.InvestigatorName.trim();
                if (bulkEditForm.Location.trim()) updates.Location = bulkEditForm.Location.trim();
                if (bulkEditForm.Result) updates.Result = bulkEditForm.Result;
                const ids = Array.from(selectedForBulk);
                const updated = trials.map(t => {
                  if (!ids.includes(t.ID)) return t;
                  const n = { ...t, ...updates };
                  if (bulkEditForm.Notes.trim()) n.Notes = n.Notes ? `${n.Notes}\n${bulkEditForm.Notes.trim()}` : bulkEditForm.Notes.trim();
                  return n;
                });
                updateState({ trials: updated });
                for (const t of updated.filter(t => ids.includes(t.ID))) {
                  try { await updateTrial(t, getAppState); } catch(e) {}
                }
                setBulkEditForm({ InvestigatorName: '', Location: '', Result: '', Notes: '' });
                setIsBulkEditOpen(false);
                clearBulk();
                window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `${ids.length} trials updated`, type: 'success' } }));
              }} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Apply to {selectedForBulk.size} Trials</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD/EDIT MODAL ── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingTrial ? 'Edit Trial' : 'New Trial'}>
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Formulation Name *</label>
              <input type="text" list="form-list" required value={formData.FormulationName} onChange={e => setFormData({...formData, FormulationName: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Select or type..." />
              <datalist id="form-list">{formulations.map(f => <option key={f.ID} value={f.Name} />)}</datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Project (RCBD)</label>
              <select value={formData.ProjectID} onChange={e => setFormData({...formData, ProjectID: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">— Standard Trial —</option>
                {projects.map(p => <option key={p.ID} value={p.ID}>{p.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Investigator *</label>
              <input type="text" required value={formData.InvestigatorName} onChange={e => setFormData({...formData, InvestigatorName: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Application Date *</label>
              <input type="date" required value={formData.Date} onChange={e => setFormData({...formData, Date: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Dosage / Treatment</label>
              <input type="text" value={formData.Dosage} onChange={e => setFormData({...formData, Dosage: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. 1500 ml/ha" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Target Weed Species</label>
              <input type="text" value={formData.WeedSpecies} onChange={e => setFormData({...formData, WeedSpecies: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Comma separated" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Yield (t/ha)</label>
              <input type="number" step="0.01" min="0" value={formData.YieldValue} onChange={e => setFormData({...formData, YieldValue: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. 3.5" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Result</label>
              <select value={formData.Result} onChange={e => setFormData({...formData, Result: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">— Select Result —</option>
                {['Excellent','Good','Fair','Poor','Control'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Weather */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1"><CloudRain className="w-3.5 h-3.5" />Weather at Application</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Temp (°C)</label>
                <input type="number" value={formData.Temperature} onChange={e => setFormData({...formData, Temperature: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Humidity (%)</label>
                <input type="number" min="0" max="100" value={formData.Humidity} onChange={e => setFormData({...formData, Humidity: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Wind (km/h)</label>
                <input type="number" value={formData.Windspeed} onChange={e => setFormData({...formData, Windspeed: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Rain (mm)</label>
                <input type="number" value={formData.Rain} onChange={e => setFormData({...formData, Rain: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            </div>
          </div>

          {/* Location + GPS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Location</label>
              <input type="text" value={formData.Location} onChange={e => setFormData({...formData, Location: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Field name or coordinates" />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={fetchGpsWeather} disabled={gpsFetching}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50 border border-blue-200">
                {gpsFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                {gpsFetching ? 'Fetching...' : 'Sync GPS + Weather'}
              </button>
            </div>
          </div>
          {(formData.Lat || formData.Lon) && (
            <p className="text-xs text-slate-400">GPS: {formData.Lat}, {formData.Lon}</p>
          )}

          {/* RCBD fields */}
          {formData.ProjectID && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Block</label>
                <select value={formData.BlockID} onChange={e => setFormData({...formData, BlockID: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">No Block</option>
                  {(state.blocks || []).filter(b => b.ProjectID === formData.ProjectID).map(b => <option key={b.ID} value={b.ID}>{b.Name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Replication #</label>
                <input type="number" value={formData.Replication} onChange={e => setFormData({...formData, Replication: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Plot #</label>
                <input type="number" value={formData.PlotNumber} onChange={e => setFormData({...formData, PlotNumber: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            </div>
          )}

          {/* Soil Data */}
          <details className="group">
            <summary className="text-xs font-semibold text-slate-500 uppercase cursor-pointer flex items-center gap-2 py-1">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span> Soil Data (optional)
            </summary>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
              {[['SoilPH','Soil pH','0.1'],['SoilClay','Clay %','1'],['SoilSand','Sand %','1'],['SoilOC','Org. Carbon %','0.01']].map(([k, label, step]) => (
                <div key={k}>
                  <label className="block text-xs text-slate-500 mb-1">{label}</label>
                  <input type="number" step={step} value={formData[k]} onChange={e => setFormData({...formData, [k]: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Texture</label>
                <select value={formData.SoilTexture} onChange={e => setFormData({...formData, SoilTexture: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">Any</option>
                  {['Loam','Clay','Sandy Loam','Sand','Silt','Clay Loam'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </details>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
            <textarea rows="2" value={formData.Notes} onChange={e => setFormData({...formData, Notes: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Conclusion</label>
            <textarea rows="2" value={formData.Conclusion} onChange={e => setFormData({...formData, Conclusion: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={formData.IsControl} onChange={e => setFormData({...formData, IsControl: e.target.checked})} className="w-4 h-4 accent-emerald-600" />
              <span className="font-medium text-slate-700">Control Plot</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={formData.IsStandardCheck} onChange={e => setFormData({...formData, IsStandardCheck: e.target.checked})} className="w-4 h-4 accent-emerald-600" />
              <span className="font-medium text-slate-700">Standard Check</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={formData.IsCompleted} onChange={e => setFormData({...formData, IsCompleted: e.target.checked})} className="w-4 h-4 accent-emerald-600" />
              <span className="font-medium text-slate-700">Mark as Completed</span>
            </label>
          </div>

          {/* Control Finalization */}
          <div className="border rounded-xl p-3 bg-orange-50 border-orange-200">
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input type="checkbox" checked={formData.ControlFinalized} onChange={e => setFormData({...formData, ControlFinalized: e.target.checked})} className="w-4 h-4 accent-orange-600" />
              <Lock className="w-3.5 h-3.5 text-orange-600" />
              <span className="font-semibold text-orange-700">Control Finalized</span>
            </label>
            {formData.ControlFinalized && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="block text-xs text-orange-700 font-semibold mb-1">Finalization Date</label>
                  <input type="date" value={formData.FinalizationDate} onChange={e => setFormData({...formData, FinalizationDate: e.target.value})} className="w-full px-3 py-2 text-sm border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs text-orange-700 font-semibold mb-1">Final Control Duration (days)</label>
                  <input type="number" min="0" value={formData.FinalControlDuration} onChange={e => setFormData({...formData, FinalControlDuration: e.target.value})} className="w-full px-3 py-2 text-sm border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
            <button type="submit" className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">{editingTrial ? 'Update Trial' : 'Save Trial'}</button>
          </div>
        </form>
      </Modal>

      {/* ── DETAIL PANEL ── */}
      {detailTrial && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={() => setActiveTrial(null)} />
          <div className="w-full max-w-2xl bg-white flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className={`p-5 flex items-start justify-between gap-3 ${detailIsCompleted ? 'bg-emerald-50' : 'bg-blue-50'}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${detailIsCompleted ? 'bg-emerald-200 text-emerald-800' : 'bg-blue-200 text-blue-800'}`}>
                    {detailIsCompleted ? 'Finalized' : 'Active'}
                  </span>
                  {detailTrial.IsControl === true || detailTrial.IsControl === 'true' ?
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-200 text-purple-800">Control</span> : null}
                  <ResultBadge result={detailTrial.Result} />
                </div>
                <h2 className="text-xl font-bold text-slate-800 truncate">{detailTrial.FormulationName}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{detailTrial.Date ? new Date(detailTrial.Date).toLocaleDateString() : ''} · {detailTrial.Location || 'No location'}</p>
              </div>
              <div className="flex gap-2 shrink-0" ref={exportMenuRef}>
                {/* Export dropdown */}
                <div className="relative">
                  <button onClick={() => setExportMenuOpen(v => !v)} title="Export" className="p-2 rounded-lg hover:bg-white/60 text-slate-600 flex items-center gap-1">
                    <FileDown className="w-4 h-4" />
                  </button>
                  {exportMenuOpen && (
                    <div className="absolute right-0 top-10 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 min-w-52 py-1">
                      <p className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase">Export This Trial</p>
                      <button onClick={() => { handleExportPdf(detailTrial); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        <FileDown className="w-4 h-4 text-red-500" /> Comprehensive PDF
                      </button>
                      <button onClick={() => { handleExportSciPdf(detailTrial); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        <ScanLine className="w-4 h-4 text-indigo-500" /> Scientific PDF
                      </button>
                      <button onClick={() => { handleExportPpt(detailTrial); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        <MonitorPlay className="w-4 h-4 text-orange-500" /> PowerPoint (.pptx)
                      </button>
                      <button onClick={() => { exportHtmlSlide(detailTrial); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        <Archive className="w-4 h-4 text-blue-500" /> HTML Report (printable)
                      </button>
                      <button onClick={() => { exportTxtReport(detailTrial); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        <FileCode className="w-4 h-4 text-slate-500" /> Field Report (.txt)
                      </button>
                      <button onClick={() => { exportCsv(detailTrial); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Observations CSV
                      </button>
                      <button onClick={() => { exportJson(detailTrial); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        <FileDown className="w-4 h-4 text-violet-500" /> Raw JSON
                      </button>
                      <button onClick={() => { shareTrial(detailTrial); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        <Share2 className="w-4 h-4 text-sky-500" /> Share / Copy
                      </button>
                      <hr className="my-1 border-slate-100" />
                      <p className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase">All Trials</p>
                      <button onClick={() => { exportAllCsv(); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Export All Trials (CSV)
                      </button>
                    </div>
                  )}
                </div>
                <button onClick={() => handleMoveToProject(detailTrial)} title="Move to Project" className="p-2 rounded-lg hover:bg-white/60 text-slate-600"><FolderOpen className="w-4 h-4" /></button>
                <button onClick={() => { setActiveTrial(null); handleOpenModal(detailTrial); }} title="Edit" className="p-2 rounded-lg hover:bg-white/60 text-slate-600"><Edit className="w-4 h-4" /></button>
                <button onClick={() => setActiveTrial(null)} className="p-2 rounded-lg hover:bg-white/60 text-slate-600"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b bg-white overflow-x-auto">
              {[['info','Info'],['observations','Observations'],['photos','Photos'],['weather','Weather'],['chart','Chart'],['statistics','Statistics'],['qr','QR Code'],['ai','AI Summary'],['export','Export']].map(([k, label]) => (
                <button key={k} onClick={() => setDetailTab(k)}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition
                    ${detailTab === k ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {label}
                  {k === 'observations' && detailEfficacy.length > 0 && <span className="ml-1 text-xs bg-emerald-100 text-emerald-700 px-1.5 rounded-full">{detailEfficacy.length}</span>}
                  {k === 'photos' && detailPhotos.length > 0 && <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 rounded-full">{detailPhotos.length}</span>}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* Info Tab */}
              {detailTab === 'info' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['Investigator', detailTrial.InvestigatorName, User],
                      ['Dosage', detailTrial.Dosage, FlaskConical],
                      ['Weed Species', detailTrial.WeedSpecies, Activity],
                      ['Project', projects.find(p => p.ID === detailTrial.ProjectID)?.Name || '—', FolderPlus],
                      ['Replication', detailTrial.Replication || '—', Hash],
                      ['Plot #', detailTrial.PlotNumber || '—', Hash],
                      ...(detailTrial.YieldValue ? [['Yield (t/ha)', detailTrial.YieldValue, Leaf]] : []),
                    ].map(([label, val, Icon]) => (
                      <div key={label} className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1"><Icon className="w-3.5 h-3.5 text-slate-400" /><span className="text-xs font-bold text-slate-500 uppercase">{label}</span></div>
                        <p className="text-sm font-semibold text-slate-800">{val || '—'}</p>
                      </div>
                    ))}
                  </div>
                  {detailTrial.Notes && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs font-bold text-slate-500 uppercase mb-1">Notes</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailTrial.Notes}</p>
                    </div>
                  )}
                  {detailTrial.Conclusion && (
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Conclusion</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailTrial.Conclusion}</p>
                    </div>
                  )}
                  {/* Soil data */}
                  {(detailTrial.SoilPH || detailTrial.SoilClay || detailTrial.SoilTexture) && (
                    <div className="bg-amber-50 rounded-lg p-3">
                      <p className="text-xs font-bold text-amber-700 uppercase mb-2">Soil Data</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {[['pH', detailTrial.SoilPH], ['Clay %', detailTrial.SoilClay], ['Sand %', detailTrial.SoilSand], ['Org. C %', detailTrial.SoilOC], ['Texture', detailTrial.SoilTexture]].filter(([, v]) => v).map(([l, v]) => (
                          <div key={l}><span className="text-amber-600 font-semibold">{l}:</span> <span className="text-slate-700">{v}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* GPS */}
                  {(detailTrial.Lat || detailTrial.Lon) && (
                    <div className="text-xs text-slate-400 flex items-center gap-1">
                      <Navigation className="w-3 h-3" /> GPS: {detailTrial.Lat}, {detailTrial.Lon}
                    </div>
                  )}
                  {/* Control Finalization */}
                  {(detailTrial.ControlFinalized === true || detailTrial.ControlFinalized === 'true') && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2 text-xs">
                      <Lock className="w-3.5 h-3.5 text-orange-500" />
                      <span className="font-semibold text-orange-700">Control Finalized</span>
                      {detailTrial.FinalControlDuration && <span className="text-orange-600">· {detailTrial.FinalControlDuration} days</span>}
                      {detailTrial.FinalizationDate && <span className="text-orange-500">· {new Date(detailTrial.FinalizationDate).toLocaleDateString()}</span>}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2 flex-wrap">
                    {!detailIsCompleted ? (
                      <button onClick={handleFinalize} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                        <Lock className="w-3.5 h-3.5" /> Finalize Trial
                      </button>
                    ) : (
                      <button onClick={handleRestart} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        <Unlock className="w-3.5 h-3.5" /> Reactivate
                      </button>
                    )}
                    <button onClick={() => { setActiveTrial(null); handleOpenModal(detailTrial, true); }} className="px-4 py-2 text-sm font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                      Duplicate
                    </button>
                    <button onClick={() => handleDelete(detailTrial.ID)} className="px-4 py-2 text-sm font-semibold bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* Observations Tab */}
              {detailTab === 'observations' && (() => {
                const sorted = [...detailEfficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
                const baseCover = parseFloat(sorted[0]?.weedCover ?? 0) || 0;
                const controlDays = (() => {
                  if (detailTrial.ControlFinalized === true || detailTrial.ControlFinalized === 'true') {
                    if (detailTrial.FinalControlDuration) return `${detailTrial.FinalControlDuration} days (final)`;
                    if (detailTrial.FinalizationDate && detailTrial.Date) {
                      const d = Math.floor((new Date(detailTrial.FinalizationDate) - new Date(detailTrial.Date)) / 86400000);
                      return `${Math.max(0, d)} days (final)`;
                    }
                    return 'Finalized';
                  }
                  if (detailTrial.Date) {
                    const d = Math.floor((new Date() - new Date(detailTrial.Date)) / 86400000);
                    return `${Math.max(0, d)} days active`;
                  }
                  return null;
                })();
                const STATUS_CLS = { Controlled: 'bg-emerald-100 text-emerald-800', Eliminated: 'bg-emerald-200 text-emerald-900', Suppressed: 'bg-blue-100 text-blue-800', 'Top-kill': 'bg-teal-100 text-teal-800', Burndown: 'bg-orange-100 text-orange-800', Regrowth: 'bg-red-100 text-red-800', 'Re-emerged': 'bg-red-200 text-red-800', Resistant: 'bg-rose-200 text-rose-900', Unaffected: 'bg-slate-200 text-slate-700', Emerged: 'bg-amber-100 text-amber-800', 'Not detected': 'bg-slate-100 text-slate-500' };
                return (
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-700">Observation Timeline</h3>
                        {controlDays && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 mt-1 inline-block">
                            ⏱ {controlDays}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {sorted.length >= 2 && (
                          <button onClick={() => generateAISummary()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-lg hover:from-violet-600 hover:to-purple-600 shadow-sm">
                            <Sparkles className="w-3.5 h-3.5" />Generate AI Summary
                          </button>
                        )}
                        <button onClick={() => setIsGridOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                          <Grid className="w-3.5 h-3.5" />Grid Tool
                        </button>
                        <button onClick={() => openObsModal(null)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                          <Plus className="w-3.5 h-3.5" />Log Observation
                        </button>
                      </div>
                    </div>
                    {sorted.length > 0 ? (
                      <div className="space-y-3">
                        {sorted.map((obs, idx) => {
                          const cover = parseFloat(obs.weedCover ?? 0);
                          const wce = baseCover > 0 && obs.daa > 0 ? Math.max(0, Math.min(100, (1 - cover / baseCover) * 100)) : null;
                          const wceRating = wce === null ? null : wce >= 85 ? 'Excellent' : wce >= 70 ? 'Good' : wce >= 50 ? 'Fair' : 'Poor';
                          const wceCls = wce === null ? '' : wce >= 85 ? 'text-emerald-700 bg-emerald-50' : wce >= 70 ? 'text-blue-700 bg-blue-50' : wce >= 50 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
                          const risks = getClimateRisks(obs.weatherTemp, obs.weatherWind, obs.weatherRain);
                          return (
                            <div key={idx} className="bg-white border rounded-xl p-4 shadow-sm">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="bg-slate-700 text-white font-bold px-2 py-1 rounded text-xs">DAA {obs.daa ?? 0}</span>
                                  <span className="text-xs text-slate-500">{obs.date ? new Date(obs.date).toLocaleDateString() : ''}</span>
                                  {wceRating && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${wceCls}`}>{wceRating}</span>}
                                  {obs.source === 'AI' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">AI</span>}
                                  {obs.aiConfidence && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${obs.aiConfidence === 'HIGH' ? 'bg-emerald-100 text-emerald-700' : obs.aiConfidence === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{obs.aiConfidence}</span>}
                                  {obs.competitionLevel && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{obs.competitionLevel}</span>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => openObsModal(detailEfficacy.indexOf(obs) !== -1 ? detailEfficacy.indexOf(obs) : idx)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded"><Edit className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => handleDeleteObs(detailEfficacy.indexOf(obs) !== -1 ? detailEfficacy.indexOf(obs) : idx)} className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2 mb-2">
                                <div className="bg-slate-50 p-2 rounded-lg text-center">
                                  <p className="text-[10px] text-slate-500 font-semibold mb-0.5">Total Cover</p>
                                  <p className="text-base font-bold text-slate-800">{cover.toFixed(1)}%</p>
                                </div>
                                <div className={`p-2 rounded-lg text-center ${wce !== null ? wceCls : 'bg-slate-50'}`}>
                                  <p className="text-[10px] font-semibold mb-0.5 opacity-70">WCE %</p>
                                  <p className="text-base font-bold">{wce !== null ? `${wce.toFixed(1)}%` : obs.daa === 0 ? 'Baseline' : '—'}</p>
                                </div>
                                <div className="bg-slate-50 p-2 rounded-lg text-center">
                                  <p className="text-[10px] text-slate-500 font-semibold mb-0.5">Species</p>
                                  <p className="text-base font-bold text-slate-700">{(obs.weedDetails || []).filter(w => w.species && w.species !== 'Total').length || '—'}</p>
                                </div>
                              </div>
                              {(obs.weedDetails || []).length > 0 && (
                                <div className="mt-2 border-t pt-2">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">Species Breakdown</p>
                                  <div className="space-y-1.5">
                                    {obs.weedDetails.map((wd, wIdx) => (
                                      <div key={wIdx} className="flex items-center justify-between text-xs gap-2">
                                        <span className="text-slate-600 truncate flex-1">{wd.species || 'Unknown'}</span>
                                        <div className="flex gap-1 shrink-0">
                                          {wd.growthStage && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">{wd.growthStage}</span>}
                                          {wd.status && <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLS[wd.status] || 'bg-slate-100 text-slate-600'}`}>{wd.status}</span>}
                                        </div>
                                        <span className="font-bold text-slate-800 shrink-0">{wd.cover}%</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Observation-level weather strip */}
                              {(obs.weatherTemp || obs.weatherWind || obs.weatherRain) && (
                                <div className="mt-2 border-t pt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
                                  {obs.weatherTemp && <span>🌡 {obs.weatherTemp}°C</span>}
                                  {obs.weatherHumidity && <span>💧 {obs.weatherHumidity}%</span>}
                                  {obs.weatherWind && <span>💨 {obs.weatherWind} km/h</span>}
                                  {obs.weatherRain && parseFloat(obs.weatherRain) > 0 && <span>🌧 {obs.weatherRain} mm</span>}
                                </div>
                              )}
                              {/* Climate risk flags */}
                              {risks.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {risks.map((risk, ri) => (
                                    <div key={ri} className={`text-[10px] px-2 py-1 rounded font-semibold flex items-center gap-1 ${
                                      risk.type === 'danger' ? 'bg-red-50 text-red-700' : risk.type === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                                    }`}>
                                      {risk.type === 'danger' ? '⚠' : risk.type === 'warning' ? '⚠' : 'ℹ'} {risk.msg}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {obs.notes && <p className="mt-2 text-xs text-slate-500 italic">"{obs.notes}"</p>}
                              {obs.aiEfficacyAssessment && (
                                <div className="mt-2 bg-purple-50 border border-purple-100 rounded-lg p-2">
                                  <p className="text-[10px] font-bold text-purple-700 uppercase mb-0.5">AI Efficacy Assessment</p>
                                  <p className="text-xs text-purple-800">{obs.aiEfficacyAssessment}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-xl">
                        <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>No observations yet</p>
                        <p className="text-xs mt-1">Track weed cover over time to evaluate efficacy</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Photos Tab */}
              {detailTab === 'photos' && (
                <div className="space-y-4">
                  {daaCoverage.allDAAs.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700">DAA Coverage Timeline</span>
                        <span className="text-[10px] text-slate-500">{daaCoverage.obsDAAs.length} obs · {daaCoverage.photoDAAs.length} photos</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {daaCoverage.allDAAs.map(daa => {
                          const hasObs = daaCoverage.obsDAAs.includes(daa);
                          const hasPhoto = daaCoverage.photoDAAs.includes(daa);
                          return (
                            <div key={daa} className={`px-2 py-1 rounded text-[10px] font-semibold ${
                              hasObs ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                              hasPhoto ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                              'bg-slate-100 text-slate-500'
                            }`} title={hasObs ? 'Has observation' : 'Has photo, needs AI scan'}>
                              DAA {daa} {hasObs ? '✓' : hasPhoto ? '📷' : ''}
                            </div>
                          );
                        })}
                      </div>
                      {daaCoverage.hasGaps && (
                        <p className="text-[10px] text-amber-600 mt-2">
                          ⚠️ Missing DAAs. Click "AI Scan All" to fill gaps.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <h3 className="font-semibold text-slate-700">Photos ({detailPhotos.length})</h3>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                        <Image className="w-3.5 h-3.5" />Upload
                      </button>
                      <button onClick={() => { setCameraMode('weed'); setIsCameraOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600">
                        <ScanLine className="w-3.5 h-3.5" />Weed Cam
                      </button>
                      <button onClick={() => { setCameraMode('general'); setIsCameraOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        <Camera className="w-3.5 h-3.5" />Camera
                      </button>
                      <button onClick={() => setAiBatchModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 shadow-lg">
                        <Sparkles className="w-3.5 h-3.5" />AI Scan All
                      </button>
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                  {detailPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {detailPhotos.map((photo, idx) => {
                        const src = photo.url || photo.fileData || photo;
                        return (
                          <div key={idx} className="relative group rounded-xl overflow-hidden bg-slate-100">
                            <img src={src} alt={`Photo ${idx + 1}`} className="w-full aspect-square object-cover" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col justify-between p-2">
                              <div className="flex justify-end gap-1 flex-wrap">
                                <button onClick={() => handleAnalyzeSinglePhoto(src, photo.date)} title="AI Full Scan & Log"
                                  className="p-1.5 bg-gradient-to-r from-purple-500 to-pink-500 backdrop-blur rounded-lg text-white hover:from-purple-600 hover:to-pink-600">
                                  <Sparkles className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => identifyWeedFromPhoto(src)} title="AI Weed ID"
                                  className="p-1.5 bg-emerald-500/80 backdrop-blur rounded-lg text-white hover:bg-emerald-600">
                                  <Leaf className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => detectWeedCoverAI(src)} title="Detect Weed Cover"
                                  className="p-1.5 bg-violet-500/80 backdrop-blur rounded-lg text-white hover:bg-violet-600">
                                  <ScanLine className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setPhotoEditModal({ idx, label: photo.label || '', date: photo.date || '' })}
                                  className="p-1.5 bg-white/20 backdrop-blur rounded-lg text-white hover:bg-white/40" title="Edit label/date">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { const a = document.createElement('a'); a.href = src; a.download = photo.fileName || `photo-${idx+1}.jpg`; a.target = '_blank'; a.click(); }}
                                  className="p-1.5 bg-white/20 backdrop-blur rounded-lg text-white hover:bg-white/40" title="Download">
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDeletePhoto(idx)} className="p-1.5 bg-red-500/80 rounded-lg text-white hover:bg-red-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                              <div>
                                <p className="text-white text-xs font-semibold truncate">{photo.label || `Photo ${idx+1}`}</p>
                                {photo.date && <p className="text-white/70 text-xs">{new Date(photo.date).toLocaleDateString()}</p>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-xl">
                      <Camera className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>No photos yet</p>
                      <p className="text-xs mt-1">Capture or upload field photos</p>
                    </div>
                  )}

                  {/* Weed ID / Cover Detection Results */}
                  {(weedIdLoading || weedIdResult || detectingCover || coverDetectResult) && (
                    <div className="border rounded-xl p-4 bg-slate-50 space-y-3">
                      {/* Weed ID */}
                      {(weedIdLoading || weedIdResult) && (
                        <div>
                          <p className="text-xs font-bold text-slate-600 uppercase mb-2 flex items-center gap-1"><Leaf className="w-3.5 h-3.5 text-emerald-600" />AI Weed Identification</p>
                          {weedIdLoading ? (
                            <div className="flex items-center gap-2 text-xs text-slate-500"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Identifying weeds...</div>
                          ) : weedIdResult && (
                            <div className="space-y-1.5">
                              {weedIdResult.map((w, i) => (
                                <div key={i} className="bg-white border rounded-lg p-2 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">{w.name}</p>
                                    {w.commonName && <p className="text-[10px] text-slate-500 italic">{w.commonName}</p>}
                                    {w.growthStage && <p className="text-[10px] text-slate-400">{w.growthStage}</p>}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-xs font-bold text-emerald-700">{w.cover}% cover</p>
                                    <p className="text-[10px] text-slate-400">{Math.round((w.confidence||0)*100)}% conf.</p>
                                  </div>
                                </div>
                              ))}
                              <button onClick={() => {
                                if (!weedIdResult) return;
                                const species = weedIdResult.map(w => w.name).join(', ');
                                window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Species copied to clipboard', type: 'success' } }));
                                navigator.clipboard?.writeText(species);
                              }} className="text-xs text-emerald-700 underline">Copy species to clipboard</button>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Cover Detection */}
                      {(detectingCover || coverDetectResult) && (
                        <div>
                          <p className="text-xs font-bold text-slate-600 uppercase mb-2 flex items-center gap-1"><ScanLine className="w-3.5 h-3.5 text-violet-600" />Weed Cover Detection</p>
                          {detectingCover ? (
                            <div className="flex items-center gap-2 text-xs text-slate-500"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Analyzing image...</div>
                          ) : coverDetectResult && (
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-white border rounded-lg p-2 text-center">
                                <p className="text-[10px] text-slate-500 font-semibold">Total Cover</p>
                                <p className="text-base font-bold text-slate-800">{coverDetectResult.cover}%</p>
                              </div>
                              <div className="bg-emerald-50 border rounded-lg p-2 text-center">
                                <p className="text-[10px] text-emerald-600 font-semibold">Green</p>
                                <p className="text-base font-bold text-emerald-700">{coverDetectResult.greenPct}%</p>
                              </div>
                              <div className="bg-amber-50 border rounded-lg p-2 text-center">
                                <p className="text-[10px] text-amber-600 font-semibold">Brown</p>
                                <p className="text-base font-bold text-amber-700">{coverDetectResult.brownPct}%</p>
                              </div>
                              <div className="col-span-3 flex items-center justify-between gap-2">
                                <span className="text-[10px] text-slate-400">Source: {coverDetectResult.source} | Confidence: {coverDetectResult.confidence}%</span>
                                <button onClick={() => setObsForm(prev => ({ ...prev, weedCover: coverDetectResult.cover }))} className="text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded font-semibold hover:bg-violet-200">Use value</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick weed ID input */}
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1"><Leaf className="w-3.5 h-3.5" />Identify Weed from New Photo</p>
                    <input ref={weedIdInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = ev => identifyWeedFromPhoto(ev.target.result);
                      reader.readAsDataURL(f);
                      e.target.value = '';
                    }} />
                    <button onClick={() => weedIdInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                      <Leaf className="w-3.5 h-3.5" /> Upload & Identify Weeds
                    </button>
                  </div>
                </div>
              )}

              {/* Chart Tab */}
              {detailTab === 'chart' && (chartDataComputed ? (
                <div>
                  <h3 className="font-semibold text-slate-700 mb-3">Weed Cover &amp; WCE% Timeline</h3>
                  <div className="bg-white border rounded-xl p-3 overflow-x-auto">
                    <div className="flex gap-4 text-xs mb-2">
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-emerald-500 rounded" />Weed Cover %</span>
                      {chartDataComputed.wcePts && <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-indigo-400 rounded" style={{borderTop:'2px dashed #818cf8'}} />WCE %</span>}
                    </div>
                    <svg width={chartDataComputed.W} height={chartDataComputed.H} className="w-full" viewBox={`0 0 ${chartDataComputed.W} ${chartDataComputed.H}`}>
                      {[0,25,50,75,100].filter(v => v <= chartDataComputed.maxCover + 5).map(v => (
                        <g key={v}>
                          <line x1={chartDataComputed.PX} y1={chartDataComputed.cy(v)} x2={chartDataComputed.W-16} y2={chartDataComputed.cy(v)} stroke="#e2e8f0" strokeWidth="1" />
                          <text x={chartDataComputed.PX-4} y={chartDataComputed.cy(v)+4} fontSize="9" fill="#94a3b8" textAnchor="end">{v}%</text>
                        </g>
                      ))}
                      <polyline points={chartDataComputed.pts} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" />
                      {chartDataComputed.wcePts && <polyline points={chartDataComputed.wcePts} fill="none" stroke="#818cf8" strokeWidth="2" strokeDasharray="5,3" strokeLinejoin="round" />}
                      {chartDataComputed.chartData.map((o, i) => (
                        <g key={i}>
                          <circle cx={chartDataComputed.cx(o.daa)} cy={chartDataComputed.cy(o.weedCover ?? 0)} r="4" fill="#10b981" stroke="white" strokeWidth="1.5" />
                          <text x={chartDataComputed.cx(o.daa)} y={chartDataComputed.H - 8} fontSize="9" fill="#64748b" textAnchor="middle">{o.daa}</text>
                        </g>
                      ))}
                      <line x1={chartDataComputed.PX} y1={chartDataComputed.PY} x2={chartDataComputed.PX} y2={chartDataComputed.H-chartDataComputed.PB} stroke="#cbd5e1" strokeWidth="1.5" />
                      <line x1={chartDataComputed.PX} y1={chartDataComputed.H-chartDataComputed.PB} x2={chartDataComputed.W-16} y2={chartDataComputed.H-chartDataComputed.PB} stroke="#cbd5e1" strokeWidth="1.5" />
                      <text x={chartDataComputed.W/2} y={chartDataComputed.H} fontSize="9" fill="#94a3b8" textAnchor="middle">Days After Application</text>
                    </svg>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[
                      ['First Cover',`${chartDataComputed.chartData[0]?.weedCover ?? '—'}%`,'bg-blue-50 text-blue-700'],
                      ['Last Cover',`${chartDataComputed.chartData[chartDataComputed.chartData.length-1]?.weedCover ?? '—'}%`,'bg-emerald-50 text-emerald-700'],
                      ['Final WCE', chartDataComputed.lastWce !== null ? `${chartDataComputed.lastWce}%` : '—','bg-indigo-50 text-indigo-700'],
                      ['Observations',chartDataComputed.chartData.length,'bg-slate-50 text-slate-700']
                    ].map(([l,v,cls]) => (
                      <div key={l} className={`rounded-lg p-2 text-center ${cls}`}><p className="text-xs font-bold opacity-70">{l}</p><p className="text-lg font-bold">{v}</p></div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <TrendingDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No observation data to chart</p>
                </div>
              ))}

              {/* Statistics Tab */}
              {detailTab === 'statistics' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-700">Trial Statistics</h3>
                    <button onClick={calcStats} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                      <RefreshCw className="w-3.5 h-3.5" /> Calculate Statistics
                    </button>
                  </div>
                  {!statsData.hasStats ? (
                    <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-xl">
                      <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>No statistical data yet</p>
                      <p className="text-xs mt-1">Click Calculate Statistics to compute WCE and ANOVA from observations</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {statsData.stats?.wce && statsData.stats.wce.length > 0 && (
                        <div>
                          <h4 className="text-sm font-bold text-slate-700 mb-2">Weed Control Efficiency — Per Observation</h4>
                          <div className="overflow-x-auto rounded-xl border">
                            <table className="min-w-full text-xs divide-y divide-slate-200">
                              <thead className="bg-slate-50"><tr>{['DAA','Species','Cover %','WCE %','Rating'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase text-[10px]">{h}</th>)}</tr></thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {statsData.stats.wce.map((w, i) => (
                                  <tr key={i} className={w.controlRating === 'Baseline' ? 'bg-slate-50' : ''}>
                                    <td className="px-3 py-2 font-bold text-slate-600">{w.daa ?? 0}</td>
                                    <td className="px-3 py-2 font-medium text-slate-700 truncate max-w-[100px]">{w.species}</td>
                                    <td className="px-3 py-2 text-slate-500">{w.finalCover}%</td>
                                    <td className={`px-3 py-2 font-bold ${w.wce === null ? 'text-slate-400' : w.wce >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>{w.wce !== null ? `${w.wce.toFixed(1)}%` : '—'}</td>
                                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${w.controlRating === 'Baseline' ? 'bg-slate-200 text-slate-600' : w.controlRating === 'Excellent' ? 'bg-emerald-100 text-emerald-800' : w.controlRating === 'Good' ? 'bg-blue-100 text-blue-800' : w.controlRating === 'Fair' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{w.controlRating}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {statsData.stats?.anovaResults?.anovaTable && (
                        <div>
                          <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">ANOVA Results <span className="text-[10px] font-normal text-slate-400">Computed: {new Date(statsData.stats.calculatedAt).toLocaleDateString()}</span></h4>
                          <div className="overflow-x-auto rounded-xl border">
                            <table className="min-w-full text-xs divide-y divide-slate-200">
                              <thead className="bg-slate-50"><tr>{['Source','DF','SS','MS','F','P > F','Sig'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase text-[10px]">{h}</th>)}</tr></thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {[statsData.stats.anovaResults.anovaTable.treatment, statsData.stats.anovaResults.anovaTable.block, statsData.stats.anovaResults.anovaTable.error, statsData.stats.anovaResults.anovaTable.total].filter(Boolean).map((row, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 font-medium text-slate-700">{row.source}</td>
                                    <td className="px-3 py-2 text-slate-500">{row.df}</td>
                                    <td className="px-3 py-2 text-slate-500">{Number.isFinite(row.ss) ? row.ss.toFixed(2) : ''}</td>
                                    <td className="px-3 py-2 text-slate-500">{Number.isFinite(row.ms) ? row.ms.toFixed(2) : ''}</td>
                                    <td className="px-3 py-2 text-slate-500">{Number.isFinite(row.f) ? row.f.toFixed(2) : '—'}</td>
                                    <td className="px-3 py-2 text-slate-500">{Number.isFinite(row.p) ? row.p.toFixed(4) : '—'}</td>
                                    <td className="px-3 py-2 font-bold text-slate-700">{row.sig || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-3">
                            <div className="bg-slate-50 rounded-lg p-2 text-xs">
                              <span className="font-semibold text-slate-500">CV: </span>
                              <span className="font-bold text-slate-700">{Number.isFinite(statsData.stats.anovaResults.diagnostics?.cv) ? statsData.stats.anovaResults.diagnostics.cv.toFixed(2) : '—'}%</span>
                              {Number.isFinite(statsData.stats.anovaResults.diagnostics?.cv) && <span className={`ml-1 text-[10px] font-semibold ${ statsData.stats.anovaResults.diagnostics.cv <= 10 ? 'text-emerald-600' : statsData.stats.anovaResults.diagnostics.cv <= 20 ? 'text-blue-600' : statsData.stats.anovaResults.diagnostics.cv <= 30 ? 'text-amber-600' : 'text-red-600' }`}>({interpretCV(statsData.stats.anovaResults.diagnostics.cv)})</span>}
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2 text-xs"><span className="font-semibold text-slate-500">R²: </span><span className="font-bold text-slate-700">{Number.isFinite(statsData.stats.anovaResults.diagnostics?.r_squared) ? statsData.stats.anovaResults.diagnostics.r_squared.toFixed(4) : '—'}</span></div>
                            <div className="bg-slate-50 rounded-lg p-2 text-xs"><span className="font-semibold text-slate-500">Mean WCE: </span><span className="font-bold text-slate-700">{statsData.renderWces.length ? statsData.renderMeanWce.toFixed(1) : '—'}%</span></div>
                          </div>
                        </div>
                      )}
                      {statsData.stats?.lsdResults?.groupings && (
                        <div>
                          <h4 className="text-sm font-bold text-slate-700 mb-2">Fisher's LSD Groupings</h4>
                          <p className="text-xs text-slate-400 mb-2">Alpha = {statsData.stats.lsdResults.alpha}, LSD = {Number.isFinite(statsData.stats.lsdResults.lsd) ? statsData.stats.lsdResults.lsd.toFixed(2) : '—'}</p>
                          <div className="overflow-x-auto rounded-xl border">
                            <table className="min-w-full text-xs divide-y divide-slate-200">
                              <thead className="bg-slate-50"><tr>{['Treatment','Mean WCE','Group'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase text-[10px]">{h}</th>)}</tr></thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {statsData.stats.lsdResults.groupings.map((g, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 font-medium text-slate-700">{g.name}</td>
                                    <td className="px-3 py-2 text-slate-500">{Number.isFinite(g.mean) ? g.mean.toFixed(2) : '—'}%</td>
                                    <td className="px-3 py-2 font-bold text-blue-700">{g.grouping || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* QR Code Tab */}
              {detailTab === 'qr' && (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-sm">
                    <canvas ref={qrCanvasRef} width={200} height={200} className="block" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => generateQR(detailTrial)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700">
                      <QrCode className="w-4 h-4" /> Generate QR
                    </button>
                    {qrGenerated && (
                      <button onClick={downloadQR} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200">
                        <Download className="w-4 h-4" /> Download
                      </button>
                    )}
                  </div>
                  <div className="w-full bg-slate-50 rounded-xl p-3 text-xs text-slate-600 border">
                    <p className="font-bold text-slate-700 mb-1">QR Data includes:</p>
                    <ul className="space-y-0.5">
                      <li>• Trial ID: <span className="font-mono">{detailTrial?.ID}</span></li>
                      <li>• Formulation: {detailTrial?.FormulationName}</li>
                      <li>• Date: {detailTrial?.Date}</li>
                      <li>• Dosage: {detailTrial?.Dosage || 'N/A'}</li>
                    </ul>
                    <p className="mt-2 text-slate-400">Scan with Plot Scanner to instantly access this trial in the field.</p>
                  </div>
                </div>
              )}

              {/* AI Summary Tab */}
              {detailTab === 'ai' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-700 flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-violet-500" /> AI Trial Narrative</h3>
                    <button onClick={generateAiSummary} disabled={aiLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
                      {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {aiLoading ? 'Generating...' : 'Generate Summary'}
                    </button>
                  </div>
                  {aiSummary ? (
                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {aiSummary}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-slate-400 border-2 border-dashed rounded-xl">
                      <BrainCircuit className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>No AI summary yet</p>
                      <p className="text-xs mt-1">Click Generate Summary to create an AI narrative for this trial</p>
                      {!state.settings?.apiKeys?.[0] && (
                        <p className="text-xs mt-2 text-amber-500 font-medium">⚠ Add a Gemini API key in Settings first</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Export Tab */}
              {detailTab === 'export' && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-700 flex items-center gap-2"><FileDown className="w-4 h-4 text-slate-500" /> Export Options</h3>

                  {/* ── PDF REPORTS ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">PDF Reports</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleExportPdf(detailTrial)} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-red-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">PDF (Ingredients)</p><p className="text-[10px] text-slate-500">With formulation ingredients</p></div>
                    </button>
                    <button onClick={() => handleExportPdfNoIng(detailTrial)} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-red-500 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">PDF (No Ing.)</p><p className="text-[10px] text-slate-500">Without ingredients list</p></div>
                    </button>
                    <button onClick={() => handleExportPdfWeedsIng(detailTrial)} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-rose-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">PDF (Weeds + Ing.)</p><p className="text-[10px] text-slate-500">Weed ID + ingredients</p></div>
                    </button>
                    <button onClick={() => handleExportPdfWeeds(detailTrial)} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-rose-500 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">PDF (Weeds)</p><p className="text-[10px] text-slate-500">Weed ID section only</p></div>
                    </button>
                    <button onClick={() => handleExportFullNoIng(detailTrial)} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-red-700 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Full Report (No Ing.)</p><p className="text-[10px] text-slate-500">Full + timeline, no ingredients</p></div>
                    </button>
                    <button onClick={() => handleExportFullIng(detailTrial)} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-red-800 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Full Report (w/ Ing.)</p><p className="text-[10px] text-slate-500">Full + timeline + ingredients</p></div>
                    </button>
                  </div>

                  {/* ── SCIENTIFIC PDF ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Scientific PDF</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleExportSciPdf(detailTrial)} className="flex items-center gap-2 p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 text-left transition">
                      <ScanLine className="w-4 h-4 text-indigo-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Scientific Report (No Ing.)</p><p className="text-[10px] text-slate-500">AI narrative, ANOVA, WCE</p></div>
                    </button>
                    <button onClick={() => handleExportSciPdfIng(detailTrial)} className="flex items-center gap-2 p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 text-left transition">
                      <ScanLine className="w-4 h-4 text-indigo-700 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Scientific Report (w/ Ing.)</p><p className="text-[10px] text-slate-500">AI + ANOVA + ingredients</p></div>
                    </button>
                  </div>

                  {/* ── WORD DOC ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Word Document (.docx)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleExportDocNoIng(detailTrial)} className="flex items-center gap-2 p-2.5 bg-sky-50 hover:bg-sky-100 rounded-xl border border-sky-200 text-left transition">
                      <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">DOC (No Ing.)</p><p className="text-[10px] text-slate-500">Word doc, no ingredients</p></div>
                    </button>
                    <button onClick={() => handleExportDocIng(detailTrial)} className="flex items-center gap-2 p-2.5 bg-sky-50 hover:bg-sky-100 rounded-xl border border-sky-200 text-left transition">
                      <FileText className="w-4 h-4 text-sky-700 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">DOC (w/ Ing.)</p><p className="text-[10px] text-slate-500">Word doc with ingredients</p></div>
                    </button>
                  </div>

                  {/* ── PRESENTATION ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Presentation</p>
                  <button onClick={() => handleExportPpt(detailTrial)} className="w-full flex items-center gap-2 p-2.5 bg-orange-50 hover:bg-orange-100 rounded-xl border border-orange-200 text-left transition">
                    <MonitorPlay className="w-4 h-4 text-orange-600 shrink-0" />
                    <div><p className="text-xs font-semibold text-slate-800">Export PPT (.pptx)</p><p className="text-[10px] text-slate-500">Slide deck: title, details, WCE table, timeline, photos, conclusion</p></div>
                  </button>

                  {/* ── FIELD REPORTS ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Field Reports</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => exportHtmlSlide(detailTrial)} className="flex items-center gap-2 p-2.5 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 text-left transition">
                      <Archive className="w-4 h-4 text-blue-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">HTML Report</p><p className="text-[10px] text-slate-500">Printable standalone page</p></div>
                    </button>
                    <button onClick={() => exportTxtReport(detailTrial)} className="flex items-center gap-2 p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border text-left transition">
                      <FileCode className="w-4 h-4 text-slate-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Field Report (.txt)</p><p className="text-[10px] text-slate-500">Plain text, all details</p></div>
                    </button>
                  </div>

                  {/* ── DATA EXPORTS ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Data Exports</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => exportCsv(detailTrial)} className="flex items-center gap-2 p-2.5 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 text-left transition">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Observations CSV</p><p className="text-[10px] text-slate-500">All observations + species</p></div>
                    </button>
                    <button onClick={() => exportJson(detailTrial)} className="flex items-center gap-2 p-2.5 bg-violet-50 hover:bg-violet-100 rounded-xl border border-violet-200 text-left transition">
                      <FileDown className="w-4 h-4 text-violet-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Raw JSON</p><p className="text-[10px] text-slate-500">Full trial record</p></div>
                    </button>
                  </div>

                  {/* ── SHARE ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Share</p>
                  <button onClick={() => shareTrial(detailTrial)} className="w-full flex items-center gap-2 p-2.5 bg-sky-50 hover:bg-sky-100 rounded-xl border border-sky-200 text-left transition">
                    <Share2 className="w-4 h-4 text-sky-600 shrink-0" />
                    <div><p className="text-xs font-semibold text-slate-800">Share / Copy Summary</p><p className="text-[10px] text-slate-500">Copy to clipboard or share via device</p></div>
                  </button>

                  {/* ── AI ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">AI Analysis</p>
                  <button onClick={() => handleAiSingleGenerate(detailTrial)} disabled={aiGenRunning} className="w-full flex items-center gap-2 p-2.5 bg-violet-50 hover:bg-violet-100 rounded-xl border border-violet-200 text-left transition disabled:opacity-50">
                    <div className="shrink-0">{aiGenRunning ? <RefreshCw className="w-4 h-4 text-violet-600 animate-spin" /> : <BrainCircuit className="w-4 h-4 text-violet-600" />}</div>
                    <div><p className="text-xs font-semibold text-slate-800">{aiGenRunning ? 'Generating...' : 'Generate AI Efficacy Report'}</p><p className="text-[10px] text-slate-500">Saves to AI Summary tab</p></div>
                  </button>

                  {/* ── BULK ── */}
                  <hr className="border-slate-200 my-1" />
                  <button onClick={exportAllCsv} className="w-full flex items-center gap-2 p-2.5 bg-white hover:bg-slate-50 rounded-xl border text-left transition">
                    <FileSpreadsheet className="w-4 h-4 text-slate-500 shrink-0" />
                    <div><p className="text-xs font-semibold text-slate-800">Export ALL Trials (CSV)</p><p className="text-[10px] text-slate-500">{trials.length} trials — full summary</p></div>
                  </button>
                </div>
              )}

              {/* Weather Tab */}
              {detailTab === 'weather' && (() => {
                const risks = getClimateRisks(detailTrial.Temperature, detailTrial.Windspeed, detailTrial.Rain);
                const hasWeather = detailTrial.Temperature || detailTrial.Humidity || detailTrial.Windspeed || detailTrial.Rain;
                return (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-700">Weather at Application</h3>
                    {hasWeather ? (
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          ['Temperature', detailTrial.Temperature, '°C', Thermometer, 'text-orange-500'],
                          ['Humidity', detailTrial.Humidity, '%', Droplets, 'text-blue-500'],
                          ['Wind Speed', detailTrial.Windspeed, 'km/h', Wind, 'text-sky-500'],
                          ['Rainfall', detailTrial.Rain, 'mm', CloudRain, 'text-indigo-500'],
                        ].map(([label, val, unit, Icon, iconCls]) => (
                          <div key={label} className="bg-slate-50 rounded-xl p-4 flex items-center gap-3">
                            <div className={`p-2.5 bg-white rounded-lg shadow-sm ${iconCls}`}><Icon className="w-5 h-5" /></div>
                            <div>
                              <p className="text-xs text-slate-500 font-semibold">{label}</p>
                              <p className="text-xl font-bold text-slate-800">{val ? `${val}${unit}` : '—'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <CloudRain className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No weather data recorded</p>
                        <p className="text-xs mt-1">Edit the trial to add weather conditions</p>
                      </div>
                    )}

                    {/* Climate Risk Audit */}
                    <div className="border rounded-xl p-4 bg-slate-50">
                      <p className="text-xs font-bold text-slate-700 uppercase mb-3 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-amber-500" /> Climate Risk Audit
                      </p>
                      {risks.length === 0 ? (
                        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2">
                          <span className="text-lg">&#10003;</span> No climate risk factors detected for this application.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {risks.map((risk, ri) => (
                            <div key={ri} className={`text-xs px-3 py-2 rounded-lg font-medium ${
                              risk.type === 'danger' ? 'bg-red-50 text-red-700 border border-red-200' :
                              risk.type === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}>
                              {risk.type === 'danger' ? '⚠️' : risk.type === 'warning' ? '⚠️' : 'ℹ️'} {risk.msg}
                            </div>
                          ))}
                        </div>
                      )}
                      {!hasWeather && (
                        <p className="text-[10px] text-slate-400 mt-2">Add application weather data to enable risk analysis.</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── AI BATCH ANALYSIS MODAL ── */}
      {aiBatchModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">AI Photo Analysis</h3>
                <p className="text-xs text-slate-500">Automatically scan all trial photos</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-4">
              <p className="text-sm text-slate-700 mb-2">This will analyze all photos using AI vision models:</p>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                <li>Identify weed species and cover %</li>
                <li>Track burndown vs unaffected weeds</li>
                <li>Auto-create observation entries</li>
                <li>Calculates DAA from photo timestamps</li>
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-800">
                <strong>Note:</strong> Requires API keys (Gemini, Groq, etc.) configured in Settings. Analysis runs with 4-second delays between photos to respect rate limits.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setAiBatchModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button onClick={handleAnalyzeAllPhotos} className="px-4 py-2 text-sm font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 shadow-lg flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Start AI Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI BATCH PROGRESS WIDGET ── */}
      {aiBatchRunning && (
        <div className="fixed top-4 right-4 bg-white shadow-xl rounded-xl p-4 z-50 min-w-[260px] border border-purple-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
            <span className="font-bold text-slate-800 text-sm">AI Analysis</span>
            <button onClick={() => setAiBatchRunning(false)} className="ml-auto text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
          </div>
          <div className="text-xs text-slate-600 mb-2">{aiBatchProgress.message}</div>
          <div className="w-full bg-slate-200 rounded-full h-2 mb-1">
            <div
              className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${aiBatchProgress.total > 0 ? (aiBatchProgress.current / aiBatchProgress.total) * 100 : 0}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 text-right">{aiBatchProgress.current} / {aiBatchProgress.total}</div>
        </div>
      )}

      {/* ── OBSERVATION MODAL ── */}
      <Modal isOpen={isObsModalOpen} onClose={() => setIsObsModalOpen(false)} title={editingObsIdx !== null ? 'Edit Observation' : 'Log Observation'}>
        <form onSubmit={handleSaveObs} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          {/* DAA + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Days After App (DAA)</label>
              <input type="number" required min="0" value={obsForm.daa} onChange={e => setObsForm({...obsForm, daa: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Date</label>
              <input type="date" required value={obsForm.date} onChange={e => setObsForm({...obsForm, date: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>

          {/* Weed Cover + AI Detection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Total Weed Cover %</label>
              <div className="flex items-center gap-2">
                <input ref={obsPhotoRef} type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = async ev => {
                    const result = await detectWeedCoverAI(ev.target.result);
                    if (result?.cover !== undefined) setObsForm(prev => ({ ...prev, weedCover: result.cover }));
                  };
                  reader.readAsDataURL(f);
                  e.target.value = '';
                }} />
                <button type="button" onClick={() => obsPhotoRef.current?.click()}
                  disabled={detectingCover}
                  className="flex items-center gap-1 text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 font-semibold disabled:opacity-50">
                  {detectingCover ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ScanLine className="w-3 h-3" />}
                  {detectingCover ? 'Detecting…' : 'Detect from Photo'}
                </button>
              </div>
            </div>
            <input type="number" required min="0" max="100" step="0.1" value={obsForm.weedCover} onChange={e => setObsForm({...obsForm, weedCover: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            {coverDetectResult && (
              <div className="mt-1.5 flex items-center gap-3 text-xs bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
                <span className="text-violet-700 font-semibold">Detected: {coverDetectResult.cover}%</span>
                <span className="text-slate-500">🟢 {coverDetectResult.greenPct}% green · 🟡 {coverDetectResult.brownPct}% brown</span>
                <span className="text-slate-400">via {coverDetectResult.source}</span>
              </div>
            )}
          </div>

          {/* Per-species weed details */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1"><Leaf className="w-3.5 h-3.5" />Weed Species Breakdown</label>
              <button type="button" onClick={() => setObsForm(prev => ({ ...prev, weedDetails: [...prev.weedDetails, { species: '', cover: '', status: '', notes: '' }] }))}
                className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-semibold hover:bg-emerald-100 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Species
              </button>
            </div>
            {obsForm.weedDetails.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No species added — total cover only will be saved.</p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {obsForm.weedDetails.map((wd, wi) => (
                  <div key={wi} className="grid grid-cols-12 gap-1.5 items-center bg-slate-50 rounded-lg p-2">
                    <input value={wd.species} onChange={e => { const d=[...obsForm.weedDetails]; d[wi]={...d[wi],species:e.target.value}; setObsForm(p=>({...p,weedDetails:d})); }}
                      placeholder="Species name" className="col-span-5 px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                    <input type="number" min="0" max="100" value={wd.cover} onChange={e => { const d=[...obsForm.weedDetails]; d[wi]={...d[wi],cover:e.target.value}; setObsForm(p=>({...p,weedDetails:d})); }}
                      placeholder="%" className="col-span-2 px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                    <select value={wd.status} onChange={e => { const d=[...obsForm.weedDetails]; d[wi]={...d[wi],status:e.target.value}; setObsForm(p=>({...p,weedDetails:d})); }}
                      className="col-span-3 px-1 py-1.5 text-xs border rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                      <option value="">Status</option>
                      {['Controlled','Burndown','Re-emerged','Resistant','Unaffected','Emerged','Not detected','Suppressed','Top-kill','Regrowth','Eliminated'].map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                    <button type="button" onClick={() => { const d=[...obsForm.weedDetails]; d.splice(wi,1); setObsForm(p=>({...p,weedDetails:d})); }}
                      className="col-span-2 flex justify-center text-slate-400 hover:text-red-500 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weather conditions at observation */}
          <div className="border rounded-xl p-3 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1"><CloudRain className="w-3.5 h-3.5 text-blue-500" />Weather at Observation</p>
              {activeTrial?.Lat && activeTrial?.Lon && (
                <button type="button" onClick={() => fetchObsWeather(obsForm.date)}
                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded font-semibold hover:bg-blue-200 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Auto-fetch
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Temp (°C)</label>
                <input type="number" step="0.1" value={obsForm.weatherTemp} onChange={e => setObsForm(p=>({...p,weatherTemp:e.target.value}))} placeholder="e.g. 24" className="w-full px-2 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Humidity (%)</label>
                <input type="number" min="0" max="100" value={obsForm.weatherHumidity} onChange={e => setObsForm(p=>({...p,weatherHumidity:e.target.value}))} placeholder="e.g. 65" className="w-full px-2 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Wind (km/h)</label>
                <input type="number" min="0" step="0.1" value={obsForm.weatherWind} onChange={e => setObsForm(p=>({...p,weatherWind:e.target.value}))} placeholder="e.g. 8" className="w-full px-2 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Rain (mm)</label>
                <input type="number" min="0" step="0.1" value={obsForm.weatherRain} onChange={e => setObsForm(p=>({...p,weatherRain:e.target.value}))} placeholder="e.g. 0" className="w-full px-2 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
            {/* Live climate risk preview */}
            {(() => {
              const risks = getClimateRisks(obsForm.weatherTemp, obsForm.weatherWind, obsForm.weatherRain);
              if (!risks.length) return null;
              return (
                <div className="space-y-1">
                  {risks.map((r, i) => (
                    <div key={i} className={`text-[10px] px-2 py-1 rounded font-semibold flex items-center gap-1 ${
                      r.type === 'danger' ? 'bg-red-50 text-red-700' : r.type === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                    }`}>{r.type === 'danger' ? '⚠' : 'ℹ'} {r.msg}</div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
            <textarea rows="2" value={obsForm.notes} onChange={e => setObsForm({...obsForm, notes: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div className="pt-3 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsObsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
            <button type="submit" className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Save Observation</button>
          </div>
        </form>
      </Modal>

      {/* ── PHOTO EDIT MODAL ── */}
      {photoEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Pencil className="w-4 h-4" /> Edit Photo</h3>
              <button onClick={() => setPhotoEditModal(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Label / Caption</label>
              <input type="text" value={photoEditModal.label} onChange={e => setPhotoEditModal(p => ({...p, label: e.target.value}))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. Pre-application, DAA 14" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Photo Date</label>
              <input type="date" value={photoEditModal.date} onChange={e => setPhotoEditModal(p => ({...p, date: e.target.value}))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button onClick={() => setPhotoEditModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
              <button onClick={handleSavePhotoEdit} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK QR CARD PRINT MODAL ── */}
      {isBulkQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-600" />
                Print QR Cards
                <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-sm">{selectedForBulk.size} trials</span>
              </h3>
              <button onClick={() => setIsBulkQrModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Card Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'id-card', label: 'ID Card', desc: '85×54mm' },
                    { value: 'a6', label: 'A6', desc: '148×105mm' },
                    { value: 'a4', label: 'A4', desc: '210×297mm' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setQrCardSize(opt.value)}
                      className={`p-3 rounded-lg border text-left transition ${qrCardSize === opt.value ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'}`}
                    >
                      <div className="font-semibold text-sm text-slate-700">{opt.label}</div>
                      <div className="text-xs text-slate-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
                <p className="font-semibold mb-1">Each card includes:</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>QR code with trial ID and details</li>
                  <li>Formulation name</li>
                  <li>Location and date</li>
                  <li>Short trial ID for reference</li>
                </ul>
              </div>

              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700">
                  Make sure to allow popups for this site. QR codes will open in a new window ready for printing.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t">
              <button
                onClick={() => setIsBulkQrModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => { generateBulkQrCards(); setIsBulkQrModalOpen(false); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Generate & Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CAMERA ── */}
      {isCameraOpen && (
        <CameraCapture onCapture={handleCapturePhoto} onClose={() => setIsCameraOpen(false)} />
      )}

      {/* ── GRID WEED COVER TOOL ── */}
      {isGridOpen && (
        <GridWeedCoverTool onClose={() => setIsGridOpen(false)} onResult={handleGridResult} />
      )}
    </div>
  );
}