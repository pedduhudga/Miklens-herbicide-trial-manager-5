import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import QRCodeLib from 'qrcode';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addTrial, deleteTrial, updateTrial, uploadPhoto, apiCall } from '../services/dataLayer.js';
import {
  Plus, Trash2, Edit, Copy, ChevronRight, Activity, MapPin, Calendar,
  CheckCircle, Camera, Grid, Info, Sparkles, Search, Filter, X,
  FileText, Printer, BarChart3, Eye, CloudRain, Wind, Thermometer,
  Droplets, Image, FolderPlus, FlaskConical, User, Hash, SlidersHorizontal,
  QrCode, BrainCircuit, TrendingDown, Download, RefreshCw, Leaf,
  Navigation, FolderOpen, Lock, Unlock,
  FileDown, Share2, MoreVertical, FileSpreadsheet,
  FileCode, MonitorPlay, Archive, Pencil, ScanLine, Crop, Clock
} from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { calculateDAA, toDateKey, formatPhotoDate, toDatetimeLocal } from '../utils/dateUtils.js';
import { validateEfficacyData } from '../utils/analysisUtils.js';
import CameraCapture from '../components/CameraCapture.jsx';
import CropperModal from '../components/CropperModal.jsx';
import GridWeedCoverTool from '../components/GridWeedCoverTool.jsx';
import { analyzePhoto, analyzePhotosBatch } from '../services/multiProviderAI.js';
import TrialCard from '../components/TrialCard.jsx';
import {
  generateComprehensivePdf,
  generateScientificReport,
  generatePpt,
  exportToCSV,
  exportMultipleTrialsToCSV,
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
  ApplicationTiming: '', WeedGrowthStage: '',
});

import { useLocation } from 'react-router-dom';

export default function Trials({ onMenuClick }) {
  const { state, updateState, getAppState, dispatch } = useAppState();
  const location = useLocation();

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
  const [bulkEditForm, setBulkEditForm] = useState({ InvestigatorName: '', Location: '', Result: '', Notes: '', Date: '', Dosage: '' });

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

  // --- Photo date prompt (shown after crop, before AI analysis) ---
  const [pendingPhotoAnalysis, setPendingPhotoAnalysis] = useState(null); // { dataUrl, date }

  // --- AI single generation ---
  const [aiGenRunning, setAiGenRunning] = useState(false);

  // --- Duplicate modal (formulation picker) ---
  const [duplicateModal, setDuplicateModal] = useState(null); // trial to duplicate
  const [duplicateFormulation, setDuplicateFormulation] = useState('');
  const [duplicateDate, setDuplicateDate] = useState('');
  const [duplicateDosage, setDuplicateDosage] = useState('');

  // --- Quick-photo target (from card Photo button) ---
  const [quickPhotoTrial, setQuickPhotoTrial] = useState(null);

  // --- Camera & Grid ---
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [gridCoverPct, setGridCoverPct] = useState(0);
  const [cameraMode, setCameraMode] = useState('general');
  const fileInputRef = useRef(null);

  // --- Cropper ---
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const quickActionTrialRef = useRef(null);
  const cropCallbackRef = useRef(null);

  // --- QR Code ---
  const qrCanvasRef = useRef(null);
  const [qrGenerated, setQrGenerated] = useState(false);
  const [qrMode, setQrMode] = useState('offline'); // 'offline' | 'online'

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
  const [qrCardSize, setQrCardSize] = useState(
    state.settings?.cardSize === 'A4' ? 'a4' : state.settings?.cardSize === 'A6' ? 'a6' : 'id-card'
  );
  const bulkQrRef = useRef(null);

  // ── ROUTING EFFECT ─────────────────────────────────────────────────
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const focusId = searchParams.get('focus');
    if (focusId) {
      const trialToFocus = state.trials?.find(t => t.ID === focusId);
      if (trialToFocus) {
        setActiveTrial(trialToFocus);
        setDetailTab('info');
      }
    }
  }, [location.search, state.trials]);

  // Keep activeTrial in sync with the global state (e.g. after sync updates)
  useEffect(() => {
    if (activeTrial) {
      const latestTrial = state.trials?.find(t => t.ID === activeTrial.ID);
      if (latestTrial && JSON.stringify(latestTrial) !== JSON.stringify(activeTrial)) {
        setActiveTrial(latestTrial);
      }
    }
  }, [state.trials, activeTrial]);

  // Sync local selectedForBulk to global selectedTrials
  useEffect(() => {
    updateState({ selectedTrials: Array.from(selectedForBulk) });
  }, [selectedForBulk, updateState]);

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
      if (sortBy === 'date-desc') {
        const dateDiff = new Date(b.Date || 0) - new Date(a.Date || 0);
        if (dateDiff !== 0) return dateDiff;

        // Secondary sort for same date: newest DateUpdatedAt / CreatedAt on top
        const aTime = new Date(a.DateUpdatedAt || a.CreatedAt || a._createdAt?.toDate?.() || 0).getTime();
        const bTime = new Date(b.DateUpdatedAt || b.CreatedAt || b._createdAt?.toDate?.() || 0).getTime();
        if (bTime !== aTime) return bTime - aTime;
        return new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0);
      }
      if (sortBy === 'date-asc') {
        const dateDiff = new Date(a.Date || 0) - new Date(b.Date || 0);
        if (dateDiff !== 0) return dateDiff;

        // Secondary sort for same date: oldest DateUpdatedAt / CreatedAt on top
        const aTime = new Date(a.DateUpdatedAt || a.CreatedAt || a._createdAt?.toDate?.() || 0).getTime();
        const bTime = new Date(b.DateUpdatedAt || b.CreatedAt || b._createdAt?.toDate?.() || 0).getTime();
        if (aTime !== bTime) return aTime - bTime;
        return new Date(a.CreatedAt || 0) - new Date(b.CreatedAt || 0);
      }
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
        ApplicationTiming: trial.ApplicationTiming || '',
        WeedGrowthStage: trial.WeedGrowthStage || '',
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

    let dateUpdatedAt = isEdit ? editingTrial.DateUpdatedAt : new Date().toISOString();
    if (isEdit && editingTrial.Date !== formData.Date) {
      dateUpdatedAt = new Date().toISOString();
    }

    const payload = {
      ...(isEdit ? editingTrial : {}),
      ...formData,
      FormulationID: formMatch?.ID || (isEdit ? editingTrial.FormulationID : ''),
      DateUpdatedAt: dateUpdatedAt,
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

  const detectWeedCoverAI = useCallback(async (imageUrl) => {
    setDetectingCover(true);
    setCoverDetectResult(null);
    try {
      const apiKey = state.settings?.geminiApiKey || (state.settings?.geminiApiKeys || state.settings?.apiKeys || [])[0];

      // Extract Drive file ID if this is a Google Drive URL
      const driveMatch = typeof imageUrl === 'string' && imageUrl.includes('drive.google.com') && imageUrl.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
      const driveFileId = driveMatch ? driveMatch[1] : null;

      if (driveFileId) {
        // Drive URL — canvas pixel analysis is CORS-blocked, use Gemini fileUri only
        if (!apiKey) {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Add a Gemini API key in Settings to analyse Drive photos', type: 'warning' } }));
          setDetectingCover(false);
          return null;
        }
        const fileUri = `https://drive.google.com/uc?export=download&id=${driveFileId}`;
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [
            { text: 'Analyze this field plot image. Estimate the percentage (0-100) of ground covered by weeds (both green and brown/burnt). Respond with ONLY a number like "45".' },
            { fileData: { mimeType: 'image/jpeg', fileUri } }
          ]}] })
        });
        const d = await resp.json();
        const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const m2 = txt.match(/\d+/);
        if (m2) {
          const cover = Math.min(100, Math.max(0, parseInt(m2[0])));
          const result = { cover, confidence: 85, source: 'AI (Gemini)', greenPct: null, brownPct: null };
          setCoverDetectResult(result);
          return result;
        }
        throw new Error('Gemini did not return a cover percentage');
      }

      // Local data URL or regular remote URL — run pixel analysis first
      let dataUrl = imageUrl;
      if (typeof imageUrl === 'string' && !imageUrl.startsWith('data:')) {
        // Fetch remote URL to data URL so pixel analysis works
        const blob = await fetch(imageUrl, { mode: 'cors' }).then(r => r.blob());
        dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onloadend = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
      }

      const pixelResult = await analyzeWeedCoverFromPixels(dataUrl);

      if (apiKey) {
        try {
          const mimeType = dataUrl.split(';')[0].split(':')[1] || 'image/jpeg';
          const base64 = dataUrl.split(',')[1];
          if (base64) {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [
                { text: 'Analyze this field plot image. Estimate the percentage (0-100) of ground covered by weeds (both green and brown/burnt). Respond with ONLY a number like "45".' },
                { inlineData: { mimeType, data: base64 } }
              ]}] })
            });
            const d = await resp.json();
            const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const m2 = txt.match(/\d+/);
            if (m2) {
              const cover = Math.min(100, Math.max(0, parseInt(m2[0])));
              const result = { cover, confidence: 90, source: 'AI (Gemini)', greenPct: pixelResult.greenPct, brownPct: pixelResult.brownPct };
              setCoverDetectResult(result);
              return result;
            }
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
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
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
      const today = new Date().toISOString().split('T')[0];
      const autoDaa = activeTrial?.Date ? calculateDAA(today, activeTrial.Date) : '';
      setObsForm({ daa: autoDaa, date: today, weedCover: '', notes: '', weedDetails: [], weatherTemp: '', weatherHumidity: '', weatherWind: '', weatherRain: '' });
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
    updateState({ trials: getAppState().trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setIsObsModalOpen(false);
    try {
      await updateTrial({ ID: updated.ID, EfficacyDataJSON: updated.EfficacyDataJSON }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Observation saved', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save observation', type: 'error' } }));
    }
  };

  const calculateResultRating = (efficacyData, isControl = false) => {
    if (isControl) return 'Control';
    if (!efficacyData || efficacyData.length === 0) return 'Unrated';
    const sorted = [...efficacyData].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
    if (sorted.length < 2) return 'Unrated';

    const baseline = sorted[0];
    const baseCover = parseFloat(baseline?.weedCover ?? 100) || 100;
    
    // Find the duration of effective suppression (cover <= 30% of baseline cover)
    let maxSuppressionDaa = parseFloat(baseline?.daa || 0);
    for (let i = 0; i < sorted.length; i++) {
      const obs = sorted[i];
      const cover = parseFloat(obs.weedCover ?? 0) || 0;
      if (cover <= 0.3 * baseCover) {
        maxSuppressionDaa = parseFloat(obs.daa || 0);
      } else if (i > 0) {
        break;
      }
    }
    
    const duration = maxSuppressionDaa - parseFloat(baseline?.daa || 0);
    
    if (duration <= 7) return 'Poor';
    if (duration <= 17) return 'Fair';
    if (duration <= 27) return 'Good';
    return 'Excellent';
  };

  const getObservedWeedsList = (efficacyData) => {
    const species = new Set();
    efficacyData.forEach(obs => {
      (obs.weedDetails || []).forEach(wd => {
        if (wd.species && wd.species !== 'No weeds detected') {
          species.add(wd.species);
        }
      });
    });
    return species.size > 0 ? Array.from(species).join(', ') : 'No weeds detected';
  };

  const handleDeleteObs = async (idx) => {
    if (!activeTrial || !window.confirm('Delete this observation?')) return;
    const efficacyData = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []));
    efficacyData.splice(idx, 1);

    const resultRating = calculateResultRating(efficacyData, activeTrial?.IsControl === true || activeTrial?.IsControl === 'true');
    const observedWeeds = getObservedWeedsList(efficacyData);

    const updated = { 
      ...activeTrial, 
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: resultRating,
      WeedSpecies: observedWeeds,
      AISummariesJSON: '{}'
    };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setAiSummary('');
    try { 
      await updateTrial({ 
        ID: updated.ID, 
        EfficacyDataJSON: updated.EfficacyDataJSON, 
        Result: updated.Result,
        WeedSpecies: updated.WeedSpecies,
        AISummariesJSON: '{}' 
      }, getAppState); 
    } catch (e) {}
  };

  // ── DETAIL TRIAL DERIVATIONS ──────────────────────────────────────
  const detailTrial = activeTrial ? (trials.find(t => t.ID === activeTrial.ID) || activeTrial) : null;
  const detailEfficacy = detailTrial ? validateEfficacyData(safeJsonParse(detailTrial.EfficacyDataJSON, [])) : [];
  const detailPhotos = detailTrial ? safeJsonParse(detailTrial.PhotoURLs, []) : [];
  const detailIsCompleted = detailTrial?.IsCompleted === true || detailTrial?.IsCompleted === 'true';

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
      const wce = obs.daa === baseline?.daa ? null : (baseCover > 0 ? Math.max(0, Math.min(100, (1 - cover / baseCover) * 100)) : 0);
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
  const openCropperFor = (dataUrl, callback) => {
    setCropSource(dataUrl);
    cropCallbackRef.current = callback;
    setCropperOpen(true);
  };

  const handleCropComplete = (croppedUrl) => {
    setCropperOpen(false);
    setCropSource(null);
    if (cropCallbackRef.current) {
      cropCallbackRef.current(croppedUrl);
      cropCallbackRef.current = null;
    }
  };

  const saveAndAnalyzePhoto = async (dataUrl, photoDateStr, targetTrialOverride = null) => {
    const targetTrial = targetTrialOverride || activeTrial;
    if (!targetTrial) return;
    setAiGenRunning(dataUrl || true);

    const photoDate = formatPhotoDate(photoDateStr || new Date().toISOString());
    const fileName = `photo_${targetTrial.ID}_${Date.now()}.jpg`;
    const tempId = `local_${Date.now()}`;

    // Build Drive folder path — same convention as HTML app:
    // Standard trial (no ProjectID): ['Ungrouped Projects', 'FormulationName (date)']
    // RCBD trial (has ProjectID):    ['ProjectName', 'FormulationName (date)']
    const project = targetTrial.ProjectID
      ? (state.projects || []).find(p => p.ID === targetTrial.ProjectID)
      : null;
    const projectName = project ? project.Name : 'Ungrouped Projects';
    const dosageSuffix = targetTrial.Dosage ? ` (${targetTrial.Dosage})` : '';
    const idSuffix = targetTrial.ID ? ` - ${String(targetTrial.ID).slice(-5)}` : '';
    const trialNameWithDate = `${targetTrial.FormulationName || 'Unknown Formulation'}${dosageSuffix} (${targetTrial.Date ? targetTrial.Date.split('T')[0] : photoDate})${idSuffix}`.trim();
    const folderPath = [projectName, trialNameWithDate];

    // Optimistically add a placeholder with tempId so the photo appears immediately
    const photoEntry = { tempId, fileData: dataUrl, date: photoDate, label: cameraMode === 'weed' ? 'Weed Photo' : 'Field Observation', identifications: [] };
    const photosOptimistic = [...safeJsonParse(targetTrial.PhotoURLs, []), photoEntry];
    const optimisticTrial = { ...targetTrial, PhotoURLs: JSON.stringify(photosOptimistic) };
    updateState({ trials: getAppState().trials.map(t => t.ID === optimisticTrial.ID ? optimisticTrial : t) });
    if (activeTrial?.ID === targetTrial.ID) setActiveTrial(optimisticTrial);

    // --- OFFLINE CHECK & QUEUE ---
    if (!navigator.onLine || getAppState().isOnline === false) {
      const syncItem = {
        id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: cameraMode === 'weed' ? 'weed_upload' : 'general_upload',
        status: 'pending',
        trialId: targetTrial.ID,
        timestamp: Date.now(),
        photo: {
          tempId: tempId,
          fileData: dataUrl,
          mimeType: 'image/jpeg',
          fileName: fileName,
          date: photoDate,
          label: photoEntry.label
        },
        attempts: 0
      };

      dispatch({ type: 'ADD_SYNC_ITEM', payload: syncItem });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'App is offline. Photo queued for sync.', type: 'info' } }));
      return;
    }

    // ONLINE PATH: Temporarily show in the Sync Queue UI as uploading
    const onlineSyncItem = {
      id: `sync_${tempId}`,
      action: `Upload Photo for ${targetTrial.FormulationName || 'Trial'}${dosageSuffix}`,
      status: 'uploading',
      trialId: targetTrial.ID,
      timestamp: Date.now(),
      photo: {
        tempId: tempId,
        fileName: fileName,
        label: photoEntry.label
      }
    };
    updateState({ syncQueue: [...getAppState().syncQueue, onlineSyncItem] });

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Uploading to Drive (${projectName} / ${trialNameWithDate})...`, type: 'info' } }));

    try {
      // 1. Upload photo to Google Drive via dataLayer (works in Firebase + Sheet modes)
      const uploadResult = await uploadPhoto({
        trialId: targetTrial.ID,
        fileData: dataUrl,
        mimeType: 'image/jpeg',
        fileName,
        isWeed: cameraMode === 'weed',
        label: photoEntry.label,
        date: photoDate,
        folderPath,
      }, getAppState);

      if (uploadResult?._errType) {
        // Remove the optimistic placeholder from UI since upload failed
        const rollback = safeJsonParse(targetTrial.PhotoURLs, []).filter(p => p.tempId !== tempId);
        const rolledBack = { ...targetTrial, PhotoURLs: JSON.stringify(rollback) };
        updateState({ trials: getAppState().trials.map(t => t.ID === rolledBack.ID ? rolledBack : t) });
        if (activeTrial?.ID === targetTrial.ID) setActiveTrial(rolledBack);
        const isConfig = uploadResult._errType === 'config';
        window.dispatchEvent(new CustomEvent('app:toast', { detail: {
          msg: isConfig
            ? '⚙️ Script URL not set — go to Settings and add your Apps Script URL to enable Drive photo uploads.'
            : (uploadResult.message || 'Drive upload failed'),
          type: 'error'
        }}));
        return;
      }

      const driveUrl = uploadResult?.url || uploadResult?.fileUrl || null;

      // 2. Replace placeholder with final Drive URL entry
      const currentPhotos = safeJsonParse(targetTrial.PhotoURLs, []).filter(p => p.tempId !== tempId);
      const finalEntry = driveUrl
        ? { url: driveUrl, date: photoDate, label: photoEntry.label, identifications: [] }
        : { ...photoEntry, tempId: undefined };
      currentPhotos.push(finalEntry);

      const updatedTrial = { ...targetTrial, PhotoURLs: JSON.stringify(currentPhotos) };
      updateState({ trials: getAppState().trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
      if (activeTrial?.ID === targetTrial.ID) setActiveTrial(updatedTrial);

      await updateTrial({ ID: updatedTrial.ID, PhotoURLs: updatedTrial.PhotoURLs }, getAppState);

      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: driveUrl ? 'Photo saved to Drive! Starting AI analysis...' : 'Photo saved locally. Starting AI analysis...', type: 'info' } }));

      const trialDate = new Date(targetTrial.Date);
      const pDate = new Date(photoDate);
      const daa = Math.max(0, Math.round((pDate.getTime() - trialDate.getTime()) / (1000 * 60 * 60 * 24)));

      // Auto-fetch weather — always attempt, using stored GPS or browser location
      const fetchWeatherForPhoto = async (lat, lon) => {
        try {
          // Use historical hourly data if photoDate is in the past, otherwise current
          const today = new Date().toISOString().split('T')[0];
          let wUrl;
          if (photoDate < today) {
            wUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${photoDate}&end_date=${photoDate}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`;
          } else {
            wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`;
          }
          const wr = await fetch(wUrl);
          const wd = await wr.json();
          let temp, hum, wind, rain;
          if (photoDate < today && wd.hourly) {
            const midday = wd.hourly.time?.findIndex(t => t.includes('T12:')) ?? 6;
            const idx = midday >= 0 ? midday : 6;
            temp = wd.hourly.temperature_2m?.[idx];
            hum = wd.hourly.relative_humidity_2m?.[idx];
            wind = wd.hourly.wind_speed_10m?.[idx];
            rain = wd.hourly.precipitation?.[idx];
          } else if (wd.current) {
            temp = wd.current.temperature_2m;
            hum = wd.current.relative_humidity_2m;
            wind = wd.current.wind_speed_10m;
            rain = wd.current.precipitation;
          }
          if (temp != null) {
            setObsForm(prev => ({ ...prev,
              weatherTemp: temp ?? prev.weatherTemp,
              weatherHumidity: hum ?? prev.weatherHumidity,
              weatherWind: wind ?? prev.weatherWind,
              weatherRain: rain ?? prev.weatherRain,
            }));
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Weather (${photoDate}): ${temp}°C, wind ${wind} km/h`, type: 'info' } }));
          }
        } catch(we) { console.warn('Weather fetch failed:', we.message); }
      };

      if (targetTrial?.Lat && targetTrial?.Lon) {
        await fetchWeatherForPhoto(targetTrial.Lat, targetTrial.Lon);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => fetchWeatherForPhoto(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6)),
          () => console.warn('Geolocation denied — weather not fetched')
        );
      }

      const result = await analyzePhoto(dataUrl, {
        treatment: targetTrial.FormulationName,
        daa,
        rep: targetTrial.Replication || 1
      }, (msg) => {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type: 'info' } }));
      });

      if (result.success) {
        await createObservationFromAI(targetTrial, daa, result.data, photoDate, driveUrl || dataUrl);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `AI complete! Logged ${result.data.weeds?.length || 0} weed species at DAA ${daa}`, type: 'success' } }));
        // Auto-run cover detection in background
        detectWeedCoverAI(dataUrl).then(coverResult => {
          if (coverResult?.cover != null) {
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Cover detected: ${coverResult.cover}% (${coverResult.source})`, type: 'info' } }));
          }
        }).catch(() => {});
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis skipped: ' + result.error, type: 'warning' } }));
      }
    } catch (e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save photo', type: 'error' } }));
    } finally {
      setAiGenRunning(false);
      updateState({ syncQueue: getAppState().syncQueue.filter(item => item.id !== `sync_${tempId}`) });
    }
  };

  const promptPhotoDate = (dataUrl, targetTrial = null) => {
    setPendingPhotoAnalysis({ dataUrl, date: toDatetimeLocal(new Date()), targetTrial });
  };

  const handleCapturePhoto = (dataUrl) => {
    const targetTrial = quickActionTrialRef.current || activeTrial;
    if (!targetTrial) return;
    quickActionTrialRef.current = null;
    setIsCameraOpen(false);
    openCropperFor(dataUrl, (url) => promptPhotoDate(url, targetTrial));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    const targetTrial = quickActionTrialRef.current || activeTrial;
    if (!file || !targetTrial) return;
    quickActionTrialRef.current = null;
    const reader = new FileReader();
    reader.onload = (ev) => {
      e.target.value = '';
      openCropperFor(ev.target.result, (url) => promptPhotoDate(url, targetTrial));
    };
    reader.readAsDataURL(file);
  };

  const handleCropExistingPhoto = (idx, currentSrc) => {
    openCropperFor(currentSrc, async (croppedUrl) => {
      const photos = safeJsonParse(activeTrial.PhotoURLs, []);
      photos[idx] = { ...photos[idx], fileData: croppedUrl, url: undefined };
      const updated = { ...activeTrial, PhotoURLs: JSON.stringify(photos) };
      updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
      setActiveTrial(updated);
      try { await updateTrial({ ID: updated.ID, PhotoURLs: updated.PhotoURLs }, getAppState); } catch (e) {}
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Photo cropped & saved', type: 'success' } }));
    });
  };

  const handleDeletePhoto = async (idx) => {
    if (!activeTrial || !window.confirm('Delete this photo?')) return;
    const photos = safeJsonParse(activeTrial.PhotoURLs, []);
    const deletedPhoto = photos[idx];
    photos.splice(idx, 1);

    // Find and delete the corresponding AI-generated observation(s) linked to this photo
    let efficacyData = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []));
    if (deletedPhoto) {
      const deletedUrl = deletedPhoto.fileData || deletedPhoto.url || deletedPhoto;
      if (deletedUrl) {
        efficacyData = efficacyData.filter(obs => obs.photoUrl !== deletedUrl);
      }
    }

    const resultRating = calculateResultRating(efficacyData, activeTrial?.IsControl === true || activeTrial?.IsControl === 'true');
    const observedWeeds = getObservedWeedsList(efficacyData);

    const updated = { 
      ...activeTrial, 
      PhotoURLs: JSON.stringify(photos),
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: resultRating,
      WeedSpecies: observedWeeds,
      AISummariesJSON: '{}'
    };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setAiSummary('');
    try { 
      await updateTrial({ 
        ID: updated.ID, 
        PhotoURLs: updated.PhotoURLs, 
        EfficacyDataJSON: updated.EfficacyDataJSON,
        Result: updated.Result,
        WeedSpecies: updated.WeedSpecies,
        AISummariesJSON: '{}'
      }, getAppState); 
    } catch (e) {}
  };

  const handleGridResult = async (coverPct) => {
    if (!activeTrial) return;
    setIsGridOpen(false);
    setObsForm(prev => ({ ...prev, weedCover: coverPct, weedDetails: [{ species: 'Total', cover: coverPct, status: '', notes: 'Measured via grid tool' }] }));
    setEditingObsIdx(null);
    setIsObsModalOpen(true);
  };

  // ── AI PHOTO ANALYSIS ─────────────────────────────────────────────
  const createObservationFromAI = async (trial, daa, aiData, obsDate = null, photoUrl = null) => {
    const latestTrial = getAppState().trials.find(t => t.ID === trial.ID) || trial;
    const efficacyData = validateEfficacyData(safeJsonParse(latestTrial.EfficacyDataJSON, []));

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

    // Build observation notes — factual only, no recommendations or projections
    const aiNotes = [];
    if (aiData.efficacyAssessment) aiNotes.push(aiData.efficacyAssessment);
    if (aiData.notes) aiNotes.push(aiData.notes);

    const newObs = {
      date: obsDate || new Date().toISOString().split('T')[0],
      daa: Number(daa),
      weedCover: totalWeedCover,
      weedDetails: normalizedWeeds.length > 0 ? normalizedWeeds : [{ species: 'No weeds detected', cover: 0, status: '', notes: aiData.notes || 'AI-analyzed' }],
      notes: aiNotes.join(' | ') || `AI-analyzed on ${new Date().toLocaleDateString()}`,
      aiConfidence: aiData.confidence || 'MEDIUM',
      aiEfficacyAssessment: aiData.efficacyAssessment || '',
      competitionLevel: aiData.competitionLevel || '',
      status: 'Analyzed',
      source: 'AI',
      photoUrl: photoUrl || ''
    };

    // Check if observation for this DAA already exists - update if so
    const existingIdx = efficacyData.findIndex(o => o.daa === Number(daa));
    if (existingIdx >= 0) {
      efficacyData[existingIdx] = newObs;
    } else {
      efficacyData.push(newObs);
    }
    efficacyData.sort((a, b) => a.daa - b.daa);

    // Calculate Result rating based on remaining living weed cover
    let resultRating = 'Unrated';
    if (efficacyData.length > 0) {
      const latestObs = [...efficacyData].sort((a, b) => (parseFloat(b.daa) || 0) - (parseFloat(a.daa) || 0))[0];
      const remainingCover = latestObs.weedCover || 0;
      if (remainingCover <= 10) {
        resultRating = 'Excellent';
      } else if (remainingCover <= 25) {
        resultRating = 'Good';
      } else if (remainingCover <= 50) {
        resultRating = 'Fair';
      } else {
        resultRating = 'Poor';
      }
    }

    const updated = {
      ...latestTrial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: resultRating,
      WeedSpecies: normalizedWeeds.length > 0 ? normalizedWeeds.map(w => w.species).join(', ') : 'No weeds detected',
      ...(Number(daa) === 0 ? {
        ApplicationTiming: latestTrial.ApplicationTiming || aiData.applicationTiming || '',
        WeedGrowthStage: latestTrial.WeedGrowthStage || aiData.overallWeedGrowthStage || ''
      } : {})
    };

    updateState({ trials: getAppState().trials.map(t => t.ID === updated.ID ? updated : t) });
    if (activeTrial?.ID === latestTrial.ID) setActiveTrial(updated);

    try {
      await updateTrial({
        ID: latestTrial.ID,
        EfficacyDataJSON: updated.EfficacyDataJSON,
        Result: updated.Result,
        WeedSpecies: updated.WeedSpecies,
        ...(Number(daa) === 0 ? {
          ApplicationTiming: updated.ApplicationTiming,
          WeedGrowthStage: updated.WeedGrowthStage
        } : {})
      }, getAppState);
    } catch (e) {
      console.error('Failed to save AI observation:', e);
    }
  };

  const handleAnalyzeAllPhotos = async (specificTrial = null) => {
    const targetTrial = (specificTrial && specificTrial.ID) ? specificTrial : activeTrial;
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
      async ({ trialId, daa, data, photoDate }) => {
        const trial = getAppState().trials.find(t => t.ID === trialId);
        if (trial) {
          await createObservationFromAI(trial, daa, data, photoDate);
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
    if (!activeTrial || aiGenRunning) return;
    setAiGenRunning(true);
    const trialDate = new Date(activeTrial.Date);
    let daa = 0;
    if (photoDate) {
      const pd = new Date(photoDate);
      daa = Math.round((pd.getTime() - trialDate.getTime()) / (1000 * 60 * 60 * 24));
      daa = daa >= 0 ? daa : 0;
    }

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Analyzing photo with AI (DAA ${daa})...`, type: 'info' } }));
    try {
      const result = await analyzePhoto(photoSrc, {
        treatment: activeTrial.FormulationName,
        daa,
        rep: activeTrial.Replication || 1
      }, (msg) => window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type: 'info' } })));

      if (result.success) {
        await createObservationFromAI(activeTrial, daa, result.data, photoDate, photoSrc);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `AI complete! Detected ${result.data.weeds?.length || 0} weed species at DAA ${daa}. Observation saved.`, type: 'success' } }));
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis failed: ' + (result.error || 'Unknown error'), type: 'error' } }));
      }
    } catch (e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis error: ' + e.message, type: 'error' } }));
    } finally {
      setAiGenRunning(false);
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

    // Build live URLs for each trial (scannable by any phone — no app needed)
    const appBase = window.location.origin + window.location.pathname;
    const trialUrls = {};
    selectedTrials.forEach(t => {
      trialUrls[t.ID] = `${appBase}#/live/${t.ID}`;
    });

    const fmtD = (d) => { try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d || ''; } };

    const cardsHtml = selectedTrials.map(trial => {
      return `
        <div class="qr-card" style="
          width: ${config.width};
          min-height: ${config.height};
          border: 2px solid #0d9488;
          border-radius: 12px;
          padding: 14px 12px;
          margin: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          page-break-inside: avoid;
          box-sizing: border-box;
        ">
          <div style="font-size: ${config.fontSize}; font-weight: 800; color: #0d9488; text-align: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 6px;">
            ${trial.FormulationName || 'Trial'}
          </div>
          <canvas id="qr-${trial.ID}" style="display:block; margin: 4px auto;"></canvas>
          <div style="font-size: calc(${config.fontSize} - 1px); color: #475569; text-align: center; line-height: 1.5; margin-top: 6px; width: 100%;">
            ${trial.InvestigatorName ? `<div><b>Inv:</b> ${trial.InvestigatorName}</div>` : ''}
            ${trial.Location ? `<div><b>Loc:</b> ${trial.Location}</div>` : ''}
            ${trial.Date ? `<div><b>Date:</b> ${fmtD(trial.Date)}</div>` : ''}
            ${trial.Dosage ? `<div><b>Dose:</b> ${trial.Dosage}</div>` : ''}
            ${trial.WeedSpecies ? `<div style="font-size:9px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%;"><b>Weeds:</b> ${trial.WeedSpecies}</div>` : ''}
            <div style="font-size: 8px; color: #94a3b8; margin-top: 5px; font-family: monospace;">ID: ${trial.ID.slice(-10)}</div>
          </div>
        </div>
      `;
    }).join('');

    // Serialize trial URLs as a JSON map for the inline script
    const urlMapJson = JSON.stringify(trialUrls).replace(/<\/script>/gi, '<\\/script>');

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>QR Trial Cards</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"><\/script>
  <style>
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
      .qr-card { break-inside: avoid; }
    }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; margin: 0; padding: 20px; }
    .controls { text-align: center; padding: 20px; background: white; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .print-btn { background: #0d9488; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; }
    .print-btn:hover { background: #0f766e; }
    .cards-container { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  </style>
</head>
<body>
  <div class="controls no-print">
    <h2 style="margin:0 0 8px;">QR Trial Cards &mdash; ${selectedTrials.length} card${selectedTrials.length > 1 ? 's' : ''}</h2>
    <p style="margin:0 0 12px; color:#64748b;">Size: ${qrCardSize.toUpperCase()} &bull; Each QR links to the live trial page</p>
    <button class="print-btn" onclick="window.print()">🖨 Print Cards</button>
  </div>
  <div class="cards-container">
    ${cardsHtml}
  </div>
  <script>
    var urlMap = ${urlMapJson};
    function generateAll() {
      var ids = Object.keys(urlMap);
      ids.forEach(function(id) {
        var canvas = document.getElementById('qr-' + id);
        if (!canvas) return;
        QRCode.toCanvas(canvas, urlMap[id], {
          width: ${config.qrSize},
          margin: 1,
          color: { dark: '#0d9488', light: '#ffffff' },
          errorCorrectionLevel: 'H'
        }, function(err) { if (err) console.error('QR error for', id, err); });
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', generateAll);
    } else {
      generateAll();
    }
  <\/script>
</body>
</html>`);
    printWindow.document.close();
  };

  // ── RESULT BADGE ──────────────────────────────────────────────────
  const sanitizePrintHtml = useCallback((value) => {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }, []);

  const getTrialCardPrintSettings = useCallback(() => {
    const sizeMap = {
      'id-card': { cardWidth: 9, cardHeight: 6, label: 'ID' },
      a6: { cardWidth: 10, cardHeight: 14, label: 'A6' },
      a4: { cardWidth: 19, cardHeight: 13, label: 'A4' },
    };
    return sizeMap[qrCardSize] || sizeMap['id-card'];
  }, [qrCardSize]);

  const buildPrintableTrialUrl = useCallback((trial) => {
    const appBase = window.location.origin + window.location.pathname;
    return `${appBase}#/live/${trial.ID}`;
  }, []);

  const syncTrialToQrScript = useCallback(async (trialPatch) => {
    const scriptUrl = String(state.settings?.scriptUrl || '').trim();
    const sheetId = String(state.settings?.sheetId || '').trim();
    if (!scriptUrl || !sheetId) return;
    const result = await apiCall('updateTrialRecord', trialPatch, false, getAppState);
    if (result?._errType) {
      throw new Error(result.message || 'Google Apps Script sync failed');
    }
  }, [getAppState, state.settings?.scriptUrl, state.settings?.sheetId]);

  const generateQrCodeDataUrl = useCallback(async (dataString) => {
    try {
      return await QRCodeLib.toDataURL(dataString, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
    } catch (error) {
      console.error('QR code generation failed:', error);
      return null;
    }
  }, []);

  const buildTrialCardsCss = useCallback((cardWidth, cardHeight) => `
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .no-print { display: none !important; }
      }
      body { margin: 0.5cm; font-family: sans-serif; background: #ffffff; }
      .print-header {
        margin-bottom: 0.5cm;
        padding: 0.35cm 0.45cm;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: #f8fafc;
      }
      .print-header h2 { margin: 0 0 0.15cm; font-size: 14pt; color: #0f172a; }
      .print-header p { margin: 0; font-size: 9pt; color: #64748b; }
      .page {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(${cardWidth}cm, 1fr));
        gap: 0.5cm;
        page-break-after: always;
      }
      .card {
        width: ${cardWidth}cm;
        height: ${cardHeight}cm;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 0.4cm;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        page-break-inside: avoid;
        overflow: hidden;
        position: relative;
        background: #ffffff;
      }
      .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.3cm; }
      .card-header h3 {
        font-size: 12pt;
        margin: 0;
        font-weight: bold;
        color: #2c5282;
        max-width: 65%;
        line-height: 1.2;
      }
      .logo { max-width: 2.5cm; max-height: 1.2cm; object-fit: contain; flex-shrink: 0; }
      .card-body { padding-right: 2.9cm; }
      .card-body p { font-size: 9pt; margin: 0.1cm 0; }
      .card-footer {
        position: absolute;
        right: 0.4cm;
        bottom: 0.4cm;
        text-align: right;
      }
      .qr-code { width: 2.5cm; height: 2.5cm; display: block; }
    `, []);

  const buildTrialCardsMarkup = useCallback(async (selectedTrials, companyLogo) => {
    const cards = [];
    for (const trial of selectedTrials) {
      const qrCodeUrl = await generateQrCodeDataUrl(buildPrintableTrialUrl(trial));
      const formattedDate = trial.Date ? new Date(trial.Date).toLocaleDateString() : '';
      cards.push(`
        <div class="card">
          <div>
            <div class="card-header">
              <h3>${sanitizePrintHtml(trial.FormulationName || 'Untitled Trial')}</h3>
              ${companyLogo ? `<img src="${companyLogo}" class="logo" alt="Logo">` : ''}
            </div>
            <div class="card-body">
              <p><strong>Investigator:</strong> ${sanitizePrintHtml(trial.InvestigatorName || '')}</p>
              <p><strong>Date:</strong> ${sanitizePrintHtml(formattedDate)}</p>
              <p><strong>Dosage:</strong> ${sanitizePrintHtml(trial.Dosage || '')}</p>
            </div>
          </div>
          <div class="card-footer">
            ${qrCodeUrl ? `<img src="${qrCodeUrl}" class="qr-code" alt="QR Code">` : ''}
          </div>
        </div>
      `);
    }
    return `<div class="page">${cards.join('')}</div>`;
  }, [buildPrintableTrialUrl, generateQrCodeDataUrl, sanitizePrintHtml]);

  const generateBulkQrCardsLegacy = useCallback(async () => {
    const selectedTrials = trials.filter(t => selectedForBulk.has(t.ID));
    if (selectedTrials.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please allow popups to print QR cards', type: 'error' } }));
      return;
    }

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating print layout...', type: 'info' } }));

    const { cardWidth, cardHeight, label } = getTrialCardPrintSettings();
    const companyLogo = state.settings?.logoBase64 || '';
    const cardsMarkup = await buildTrialCardsMarkup(selectedTrials, companyLogo);
    const cardsCss = buildTrialCardsCss(cardWidth, cardHeight);

    printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Print Trial Cards</title>
  <style>${cardsCss}</style>
</head>
<body>
  <div class="print-header no-print">
    <h2>Trial Cards</h2>
    <p>${selectedTrials.length} card${selectedTrials.length > 1 ? 's' : ''} • Size ${label}</p>
  </div>
  ${cardsMarkup}
</body>
</html>`);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 500);
  }, [buildTrialCardsCss, buildTrialCardsMarkup, getTrialCardPrintSettings, selectedForBulk, state.settings?.logoBase64, trials]);

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
    setDuplicateFormulation(trial.FormulationName || '');
    setDuplicateDate(new Date().toISOString().split('T')[0]);
    setDuplicateDosage('');
    setDuplicateModal(trial);
  }, []);

  const handleDuplicateConfirm = useCallback(async () => {
    if (!duplicateModal) return;
    const trial = duplicateModal;
    setDuplicateModal(null);
    const formMatch = formulations.find(f => f.Name === duplicateFormulation);
    const payload = {
      ...trial,
      ID: undefined,
      FormulationName: duplicateFormulation,
      FormulationID: formMatch ? formMatch.ID : (trial.FormulationID || ''),
      Date: duplicateDate || new Date().toISOString().split('T')[0],
      Dosage: duplicateDosage.trim() !== '' ? duplicateDosage.trim() : (trial.Dosage || ''),
      IsCompleted: false, ControlFinalized: false,
      FinalizationDate: '', FinalControlDuration: '',
      PhotoURLs: '[]', WeedPhotosJSON: '[]',
      EfficacyDataJSON: '[]', StatisticsJSON: '',
      Result: '', Conclusion: '', IsLive: true,
    };
    delete payload.ID;
    try {
      const result = await addTrial(payload, getAppState);
      const newTrial = { ...payload, ID: result.ID || result.id || Date.now().toString() };
      updateState({ trials: [newTrial, ...trials] });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Duplicated as "${duplicateFormulation}"`, type: 'success' } }));
    } catch(e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Duplicate failed', type: 'error' } }));
    }
  }, [duplicateModal, duplicateFormulation, duplicateDate, duplicateDosage, formulations, trials, getAppState, updateState]);

  const handleQuickRate = useCallback(async (trial, rating) => {
    const newRating = trial.Result === rating ? '' : rating;
    const updated = { ...trial, Result: newRating };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    try { await updateTrial({ ID: updated.ID, Result: newRating }, getAppState); } catch(e) {}
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: newRating ? `Rated "${newRating}"` : 'Rating cleared', type: 'success' } }));
  }, [trials, getAppState, updateState]);

  const handleMarkComplete = useCallback(async (trial) => {
    if (!window.confirm(`Mark "${trial.FormulationName}" as completed? This will stop control day counting and deactivate the trial.`)) return;
    const finDate = new Date().toISOString().split('T')[0];
    const start = trial.Date ? new Date(trial.Date) : new Date();
    const days = Math.max(0, Math.round((new Date() - start) / 86400000));
    const finalDuration = trial.FinalControlDuration || String(days);
    const updated = { ...trial, IsCompleted: true, IsLive: false, FinalizationDate: finDate, FinalControlDuration: finalDuration };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    if (activeTrial?.ID === updated.ID) setActiveTrial(updated);
    try {
      await updateTrial({ ID: updated.ID, IsCompleted: true, IsLive: false, FinalizationDate: finDate, FinalControlDuration: finalDuration }, getAppState);
      await syncTrialToQrScript({ ID: updated.ID, IsCompleted: true, IsLive: false, FinalizationDate: finDate, FinalControlDuration: finalDuration });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Trial completed — ${finalDuration} control days recorded`, type: 'success' } }));
    } catch(e) {}
  }, [trials, activeTrial, getAppState, updateState, syncTrialToQrScript]);

  const handleQuickPhoto = useCallback((trial) => {
    quickActionTrialRef.current = trial;
    setCameraMode('general');
    setIsCameraOpen(true);
  }, []);

  const handleQuickGalleryUpload = useCallback((trial) => {
    quickActionTrialRef.current = trial;
    setCameraMode('general');
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleActivateToggle = useCallback(async (trial) => {
    const isCurrentlyLive = String(trial.IsLive) !== 'false';
    const patch = isCurrentlyLive
      ? { IsLive: false }
      : { IsLive: true, IsCompleted: false, FinalizationDate: '', FinalControlDuration: '' };
    const updated = { ...trial, ...patch };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    if (activeTrial?.ID === updated.ID) setActiveTrial(updated);
    try {
      await updateTrial({ ID: updated.ID, ...patch }, getAppState);
      await syncTrialToQrScript({ ID: updated.ID, ...patch });
    } catch(e) {}
    if (!isCurrentlyLive) window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial reactivated — control days reset', type: 'success' } }));
  }, [trials, activeTrial, updateState, getAppState, syncTrialToQrScript]);

  const handleEditControlDays = useCallback(async (trial) => {
    const current = trial.FinalControlDuration || String(Math.max(0, Math.round((new Date() - new Date(trial.Date || Date.now())) / 86400000)));
    const val = window.prompt(`Edit control days for "${trial.FormulationName}":`, current);
    if (val === null || val.trim() === '') return;
    const days = parseInt(val.trim(), 10);
    if (isNaN(days) || days < 0) { window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Invalid number', type: 'error' } })); return; }
    const updated = { ...trial, FinalControlDuration: String(days) };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    if (activeTrial?.ID === updated.ID) setActiveTrial(updated);
    try { await updateTrial({ ID: updated.ID, FinalControlDuration: String(days) }, getAppState); } catch(e) {}
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Control days set to ${days}`, type: 'success' } }));
  }, [trials, activeTrial, updateState, getAppState]);

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
    const maxDaa = Math.max(...chartData.map(o => o.daa)) || 1;
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

  // Status class mapping for observations
  const STATUS_CLS = useMemo(() => ({ Controlled: 'bg-emerald-100 text-emerald-800', Eliminated: 'bg-emerald-200 text-emerald-900', Suppressed: 'bg-blue-100 text-blue-800', 'Top-kill': 'bg-teal-100 text-teal-800', Burndown: 'bg-orange-100 text-orange-800', Regrowth: 'bg-red-100 text-red-800', 'Re-emerged': 'bg-red-200 text-red-800', Resistant: 'bg-rose-200 text-rose-900', Unaffected: 'bg-slate-200 text-slate-700', Emerged: 'bg-amber-100 text-amber-800', 'Not detected': 'bg-slate-100 text-slate-500' }), []);

  // Pre-compute observations sorting and values
  const obsData = useMemo(() => {
    const sorted = [...detailEfficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
    const baseCover = parseFloat(sorted[0]?.weedCover ?? 0) || 0;
    return { sorted, baseCover };
  }, [detailEfficacy]);

  // ── QR CODE GENERATOR ─────────────────────────────────────────────
  const buildQrText = useCallback((trial, mode) => {
    if (mode === 'online') {
      return buildPrintableTrialUrl(trial);
    }
    // Offline: compact human-readable text encoding (like HTML app)
    const fields = state.settings?.qrOfflineFields || ['FormulationName','Dosage','WeedSpecies','Date','Location'];
    const fmt = (d) => { try { return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).replace(/ /g,'-'); } catch { return d || ''; } };
    const lines = [`MIKLENS-TRIAL`];
    lines.push(`ID:${trial.ID}`);
    if (fields.includes('FormulationName') && trial.FormulationName) lines.push(`Product:${trial.FormulationName}`);
    if (fields.includes('InvestigatorName') && trial.InvestigatorName) lines.push(`Inv:${trial.InvestigatorName}`);
    if (fields.includes('Date') && trial.Date) lines.push(`Date:${fmt(trial.Date)}`);
    if (fields.includes('Dosage') && trial.Dosage) lines.push(`Dose:${trial.Dosage}`);
    if (fields.includes('Location') && trial.Location) lines.push(`Loc:${trial.Location}`);
    if (fields.includes('WeedSpecies') && trial.WeedSpecies) lines.push(`Weeds:${trial.WeedSpecies}`);
    if (fields.includes('Result') && trial.Result) lines.push(`Result:${trial.Result}`);
    if (trial.Replication) lines.push(`Rep:${trial.Replication}`);
    return lines.join('\n');
  }, [buildPrintableTrialUrl, state.settings]);

  const generateQR = useCallback(async (trial, mode) => {
    if (!trial || !qrCanvasRef.current) return;
    setQrGenerated(false);
    const resolvedMode = mode || qrMode;
    const qrText = buildQrText(trial, resolvedMode);
    try {
      await QRCodeLib.toCanvas(qrCanvasRef.current, qrText, {
        width: 220,
        margin: 2,
        color: { dark: '#1e293b', light: '#ffffff' },
        errorCorrectionLevel: 'H'
      });
      setQrGenerated(true);
    } catch (e) {
      console.error('QR gen error', e);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'QR generation failed: ' + e.message, type: 'error' } }));
    }
  }, [qrMode, buildQrText]);

  const downloadQR = useCallback(() => {
    if (!qrCanvasRef.current) return;
    const a = document.createElement('a');
    a.download = `QR_${detailTrial?.FormulationName || 'trial'}_${qrMode}.png`;
    a.href = qrCanvasRef.current.toDataURL('image/png');
    a.click();
  }, [detailTrial, qrMode]);

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
      const sorted = [...efficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));

      // Build a rich observation timeline for the AI
      const obsLines = sorted.map(o => {
        const speciesLine = (o.weedDetails || []).map(w => `${w.species}: ${w.cover}%`).join(', ');
        return `  DAA ${o.daa}: total cover ${o.weedCover ?? '?'}%${speciesLine ? ` (${speciesLine})` : ''}${o.notes ? ` — ${o.notes}` : ''}`;
      }).join('\n');

      // Compute key metrics to feed the AI
      const baseline = sorted[0];
      const latest = sorted[sorted.length - 1];
      const baseCover = parseFloat(baseline?.weedCover ?? 0) || 0;
      const finalCover = parseFloat(latest?.weedCover ?? 0) || 0;
      const wce = baseCover > 0 ? Math.max(0, ((baseCover - finalCover) / baseCover) * 100) : 0;
      const minObs = sorted.reduce((m, o) => (o.weedCover ?? 100) < (m.weedCover ?? 100) ? o : m, sorted[0] ?? {});
      const controlDaysVal = detailTrial.FinalControlDuration
        ? parseInt(detailTrial.FinalControlDuration, 10)
        : (detailTrial.Date ? Math.max(0, Math.round((new Date() - new Date(detailTrial.Date)) / 86400000)) : null);

      const allSpecies = new Set();
      sorted.forEach(o => {
        (o.weedDetails || []).forEach(wd => {
          if (wd.species && wd.species.toLowerCase() !== 'total') {
            allSpecies.add(wd.species);
          }
        });
      });

      const speciesMap = {};
      allSpecies.forEach(sp => {
        speciesMap[sp] = [];
        sorted.forEach(o => {
          const match = (o.weedDetails || []).find(wd => wd.species === sp);
          if (match) {
            speciesMap[sp].push({ daa: o.daa, cover: match.cover ?? 0, status: match.status || '' });
          } else {
            speciesMap[sp].push({ daa: o.daa, cover: 0, status: 'Not detected' });
          }
        });
      });

      const speciesAnalysis = Object.entries(speciesMap).map(([sp, pts]) => {
        const spSorted = pts.sort((a, b) => a.daa - b.daa);
        const spInit = spSorted[0]?.cover ?? 0;
        const spFinal = spSorted[spSorted.length - 1]?.cover ?? 0;
        const spMin = Math.min(...spSorted.map(p => p.cover));
        const spMinDaa = spSorted.find(p => p.cover === spMin)?.daa ?? 0;
        const spWce = spInit > 0 ? Math.max(0, ((spInit - spFinal) / spInit) * 100).toFixed(1) : '0';
        const trajectory = spSorted.map(p => `DAA${p.daa}:${p.cover}%`).join(' → ');
        return `  ${sp}: ${trajectory} | WCE ${spWce}% | Best suppression ${spMin}% at DAA${spMinDaa} | Final ${spFinal}%`;
      }).join('\n') || '  No per-species data recorded.';

      const fmtTrialDate = (() => {
        try {
          const d = new Date(detailTrial.Date);
          if (isNaN(d)) return detailTrial.Date || 'N/A';
          return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
        } catch { return detailTrial.Date || 'N/A'; }
      })();

      const prompt = `You are a senior agronomist writing a professional herbicide field trial narrative for an official regulatory-style report (SOP/TDS validation standard).
      
      Do NOT include any observations about photo mismatches, data anomalies, or reporting inconsistencies in the main 5 sections. Any data anomalies or discrepancies must be appended strictly at the end, separated by a custom delimiter.
      
      Do NOT include any suggestions, recommendations, comments about further monitoring, or proposals for future testing inside the main 5 sections. Keep the 5 sections strictly factual, reporting only observed data and final factual performance assessments. All recommendations, suggestions, and speculative remarks must be appended strictly at the end after the delimiter.

TRIAL DATA:
- Product: ${detailTrial.FormulationName}
- Application date: ${fmtTrialDate}, Location: ${detailTrial.Location || 'N/A'}
- Dosage: ${detailTrial.Dosage || 'N/A'}
- Target weeds: ${detailTrial.WeedSpecies || 'Not specified'}
- Control days tracked: ${controlDaysVal != null ? controlDaysVal + ' days' : 'Ongoing'}
- Trial status: ${(detailTrial.IsCompleted === true || detailTrial.IsCompleted === 'true') ? 'Completed/Finalized' : 'Ongoing'}
- Rated result: ${detailTrial.Result || 'Not yet rated'}
- Overall WCE: ${wce.toFixed(1)}% (initial ${baseCover}% → final ${finalCover}%)
- Best overall suppression: ${minObs.weedCover ?? '?'}% at DAA ${minObs.daa ?? '?'}

FULL OBSERVATION TIMELINE (Days After Application → total weed cover %):
${obsLines || '  No observations recorded yet.'}

PER-SPECIES BREAKDOWN:
${speciesAnalysis}

HERBICIDE CONTROL DURATION BENCHMARKS (use these exact thresholds):
- ≤7 days of effective suppression = Poor
- 8–17 days = Fair
- 18–27 days = Good
- 28+ days = Excellent
- "Effective suppression" means cover stayed below 30% of initial level before significant regrowth.
- If cover INCREASES at later DAAs after an initial drop, regrowth is occurring — note the regrowth DAA.
- If cover never drops meaningfully (<20% reduction), the product had no measurable control on that species.

LANGUAGE AND TONE RULES — follow strictly:
1. Regulatory-neutral tone. Do NOT use aggressive or emotive language (avoid: "complete lack of efficacy", "product failed", "unacceptable", "benchmark for effective suppression"). Use neutral, factual phrasing: "inadequate weed control under the evaluated conditions", "no measurable suppression was observed", "no observable response attributable to the treatment", "indicating insufficient weed control performance".
2. Do NOT speculate beyond observed data. Do not write "active growth and proliferation" unless biomass data supports it. Use cover % data only.
3. Do NOT write "best or worst performance" comparisons — only state observed cover values objectively.
4. Do NOT use any markdown formatting (no **, no *, no #, no bullet dashes, no hyphens as bullets). Plain text only.
5. Section headings as plain numbered text: "1. Application & Setup" on its own line.
6. SPECIES HEADING RULE: Each species heading must be written as "Common Name (Scientific Name)" — e.g. "Bermuda Grass (Cynodon dactylon)". NEVER write the same name twice like "Cynodon dactylon (Cynodon dactylon)". If no common name is known, write only the scientific name. Use the common names from the target weed field or weed details if available.
6a. SCIENTIFIC NAME CAPITALISATION: Always format scientific names as "Genus species" — Genus is capitalised, species epithet is fully lowercase. E.g. "Medicago polymorpha" not "medicago Polymorpha" or "Medicago Polymorpha".
7. Application date must be formatted as DD-Mon-YYYY (e.g. 19-Apr-2026). Dosage units: write "mL" not "ml". Write coordinates as provided. Use "at coordinates X, Y" — never "at location X, Y".
8. Do NOT use the word "phytotoxic" or "phytotoxicity". Use "herbicidal injury symptoms" instead.
9. Write in third person. Past tense for finalized trials, present tense for ongoing.
10. Include a detailed, scientific conclusion in Section 5. If individual species baseline covers are recorded as 0% but overall weed cover drops significantly (e.g. from 100% to 5%), do NOT conclude that the treatment failed to control those species or that the data is an anomaly inside the main narrative sections. Simply state that target weeds were successfully controlled based on the overall cover reduction. Keep all comments about observation anomalies, data mismatch, suggestions, recommendations, or potential incorrect uploads completely out of the 5 main sections.

OUTPUT STRUCTURE — write exactly these 5 sections, nothing else (no other intro/outro text, and no delimiters inside the 5 sections):

1. Application & Setup
One sentence. Start directly with the product name (no "Product X was applied" prefix — just "[Product name] was applied…"). Include dosage (with proper units), application date (DD-Mon-YYYY), coordinates, and all target weed species with scientific names in parentheses.

2. Overall Efficacy Trajectory
Exactly 3 sentences. Follow this structure precisely:
- Sentence 1: "At DAA [first], total weed cover was recorded at X%."
- Sentence 2: Dynamically describe the final weed cover and its control interpretation based on the actual data.
- Sentence 3: Dynamically describe the presence, progression, or absence of herbicidal injury symptoms and physical weed responses observed in the timeline notes.

3. Species-wise Performance
For EACH species in the per-species breakdown — write the species heading (Common Name + Scientific Name), then 1-2 sentences:
- Begin each species paragraph with "At DAA X," — never "At X Days After Application".
- State cover value at each observed DAA factually.
- For no-control cases use: "No measurable suppression or reduction in cover was observed for this species." or "No observable reduction in cover attributable to the treatment was detected."
- For partial control only: "Minimal to no observable control was evident for this species."
- After ALL species, write ONE closing summary sentence on its own line: State a clean summary of the overall species-wise control trajectory based on the actual observed data. If overall weed cover decreased significantly (e.g. by 70% or more), do NOT say evaluated species demonstrated negligible control. Instead, state that the target weed population was successfully suppressed overall.

4. Control Duration Interpretation
Exactly 2 sentences. Follow this structure:
- Sentence 1: Dynamically describe the change or reduction in weed cover over the observation period based on the data.
- Sentence 2: "Treatment performance was classified as [Poor/Fair/Good/Excellent], indicating [sufficient/highly effective/moderate/insufficient] weed control performance under the evaluated field conditions."

5. Agronomic Conclusion & Weed Control Assessment
Write 3 to 4 detailed sentences providing a proper scientific conclusion:
- Sentence 1: Detail the duration of effective control and peak control percentage.
- Sentence 2: Detail which weed species were successfully addressed (controlled/suppressed) and to what maximum efficacy percentage. If individual species baseline covers were recorded as 0% but overall weed cover dropped significantly, clarify that since the overall weed cover was reduced by X%, the target weeds were successfully suppressed.
- Sentence 3: Detail which weed species re-emerged or regrew during the trial and at which DAA the re-emergence or regrowth was detected.
- Sentence 4: Conclude with a final factual agronomic performance assessment statement for the treatment under the evaluated conditions. Do NOT include future trial recommendations, suggestions for further evaluations, or speculative remarks.

DETAILED ANOMALIES & SUGGESTIONS (APPEND SEPARATELY):
At the very end of your response, after the 5 sections, write a delimiter line: "---ANOMALIES---"
Following this delimiter, perform:
1. Chronological and biological anomaly detection check (such as 0% baseline target weeds, photo mismatch, or incorrect uploads).
2. Factual recommendations, suggestions for future trials, and comments regarding further monitoring or evaluations.
If none are present, write "None".`;

      const model = 'gemini-2.5-flash';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      let text = '';
      if (!res.ok) {
        // Fallback to gemini-2.5-flash-lite if primary fails
        const fallbackRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const fallbackData = await fallbackRes.json();
        text = fallbackData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text) throw new Error('Empty AI response from fallback model');
      } else {
        const data = await res.json();
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text) throw new Error('Empty AI response');
      }
      
      let cleanNarrative = text;
      let anomalies = '';
      if (text.includes('---ANOMALIES---')) {
        const parts = text.split('---ANOMALIES---');
        cleanNarrative = parts[0].trim();
        anomalies = parts[1].trim();
      }

      setAiSummary(cleanNarrative);
      // ── Persist to Firebase so it survives refresh ──
      const obsCount = efficacy.length;
      const existing = safeJsonParse(detailTrial.AISummariesJSON, {});
      const updatedSummaries = { 
        ...existing, 
        narrative: cleanNarrative, 
        anomalies, 
        narrativeObsCount: obsCount, 
        narrativeGeneratedAt: new Date().toISOString() 
      };
      const updatedTrial = { ...detailTrial, AISummariesJSON: JSON.stringify(updatedSummaries) };
      updateState({ trials: trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
      setActiveTrial(updatedTrial);
      try { 
        await updateTrial({ ID: updatedTrial.ID, AISummariesJSON: updatedTrial.AISummariesJSON }, getAppState); 
      } catch(e) {
        console.error('Failed to save AI summary:', e);
      }
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI narrative saved!', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `AI error: ${err.message}`, type: 'error' } }));
    } finally {
      setAiLoading(false);
    }
  }, [detailTrial, state.settings, trials, updateState, getAppState]);

  // Load saved AI narrative when switching to AI tab or changing trial
  useEffect(() => {
    const saved = safeJsonParse(detailTrial?.AISummariesJSON, {});
    setAiSummary(saved.narrative || '');
    setQrGenerated(false);
    setExportMenuOpen(false);
  }, [detailTrial?.ID]);

  // Automatically correct existing stale ratings (e.g. legacy/deleted observations not matching Result field) on trial selection
  useEffect(() => {
    if (!detailTrial) return;
    const efficacy = validateEfficacyData(safeJsonParse(detailTrial.EfficacyDataJSON, []));
    const calculated = calculateResultRating(efficacy, detailTrial?.IsControl === true || detailTrial?.IsControl === 'true');
    if (calculated !== detailTrial.Result) {
      const updated = { ...detailTrial, Result: calculated };
      updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
      setActiveTrial(updated);
      updateTrial({ ID: updated.ID, Result: calculated }, getAppState).catch(console.error);
    }
  }, [detailTrial?.ID, detailTrial?.EfficacyDataJSON, trials, updateState, getAppState]);

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
  // Helper: check if AI narrative is stale before export
  const checkAiNarrativeBeforeExport = useCallback((trial, proceed) => {
    const saved = safeJsonParse(trial.AISummariesJSON, {});
    const currentObsCount = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, [])).length;
    const savedObsCount = saved.narrativeObsCount ?? null;
    const hasNarrative = !!saved.narrative;
    if (!hasNarrative) {
      // No narrative at all — offer to continue without or cancel
      if (window.confirm('No AI narrative has been generated for this trial yet.\n\nClick OK to download the report without AI narrative, or Cancel to go generate one first (AI tab).')) {
        proceed();
      }
      return;
    }
    if (savedObsCount !== null && currentObsCount > savedObsCount) {
      // Stale narrative — new observations added since last generation
      const genDate = saved.narrativeGeneratedAt ? new Date(saved.narrativeGeneratedAt).toLocaleString() : 'unknown';
      if (window.confirm(`New observations have been added since the AI narrative was last generated (${genDate}, based on ${savedObsCount} observation${savedObsCount !== 1 ? 's' : ''}).\n\nCurrently there ${currentObsCount === 1 ? 'is' : 'are'} ${currentObsCount} observation${currentObsCount !== 1 ? 's' : ''}.\n\nClick OK to download with the existing narrative, or Cancel to regenerate first (AI tab).`)) {
        proceed();
      }
      return;
    }
    // Narrative is fresh — proceed directly
    proceed();
  }, []);

  // PDF variants — matching legacy buttons exactly
  const handleExportPdf          = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: true,  withWeeds: false, withTimeline: false, ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportPdfNoIng     = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: false, withWeeds: false, withTimeline: false, ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportPdfWeedsIng  = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: true,  withWeeds: true,  withTimeline: false, ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportPdfWeeds     = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: false, withWeeds: true,  withTimeline: false, ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportFullNoIng    = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: false, withWeeds: true,  withTimeline: true,  ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportFullIng      = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: true,  withWeeds: true,  withTimeline: true,  ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  // Scientific PDF variants — pass narrative into report
  const handleExportSciPdf       = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => { const saved = safeJsonParse(trial.AISummariesJSON, {}); const aiSummary = saved.narrative || saved.cover || ''; generateScientificReport(trial, { withIngredients: false, aiSummary, ...opts, formulations: state.formulations || [] }); }), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportSciPdfIng    = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => { const saved = safeJsonParse(trial.AISummariesJSON, {}); const aiSummary = saved.narrative || saved.cover || ''; generateScientificReport(trial, { withIngredients: true,  aiSummary, ...opts, formulations: state.formulations || [] }); }), [state.formulations, checkAiNarrativeBeforeExport]);
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
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }) });
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
    const oldPhoto = photos[photoEditModal.idx];
    const oldDate = oldPhoto?.date;
    const newDate = photoEditModal.date;

    // Find sequence rank of this photo in chronological order before updating it
    const sortedOriginalPhotos = [...photos].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    const rank = sortedOriginalPhotos.indexOf(oldPhoto);

    photos[photoEditModal.idx] = { ...oldPhoto, label: photoEditModal.label, date: formatPhotoDate(newDate) };

    const efficacyData = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []));
    let efficacyChanged = false;

    if (oldDate && newDate && oldDate !== newDate) {
      const oldDaa = activeTrial.Date ? calculateDAA(oldDate, activeTrial.Date) : null;
      const newDaa = activeTrial.Date ? calculateDAA(newDate, activeTrial.Date) : null;

      // 1. Try matching by photoUrl
      let matched = false;
      const photoUrlToMatch = oldPhoto?.url || oldPhoto?.fileData;
      if (photoUrlToMatch) {
        efficacyData.forEach(obs => {
          if (obs.photoUrl === photoUrlToMatch) {
            obs.date = newDate;
            if (newDaa !== null) obs.daa = newDaa;
            efficacyChanged = true;
            matched = true;
          }
        });
      }

      // 2. Fallback to sequence rank (index of sorted list)
      if (!matched && rank >= 0) {
        const sortedEff = [...efficacyData].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
        const obsToUpdate = sortedEff[rank];
        if (obsToUpdate) {
          const mainObs = efficacyData.find(o => o.daa === obsToUpdate.daa && o.date === obsToUpdate.date);
          if (mainObs) {
            mainObs.date = newDate;
            if (newDaa !== null) mainObs.daa = newDaa;
            efficacyChanged = true;
          }
        }
      }
    }

    if (efficacyChanged) {
      efficacyData.sort((a, b) => a.daa - b.daa);
    }

    const updated = {
      ...activeTrial,
      PhotoURLs: JSON.stringify(photos),
      ...(efficacyChanged ? { EfficacyDataJSON: JSON.stringify(efficacyData) } : {})
    };

    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setPhotoEditModal(null);
    try {
      await updateTrial({
        ID: updated.ID,
        PhotoURLs: updated.PhotoURLs,
        ...(efficacyChanged ? { EfficacyDataJSON: updated.EfficacyDataJSON } : {})
      }, getAppState);
    } catch (e) {}
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
                  onQuickRate={handleQuickRate}
                  onQuickPhoto={handleQuickPhoto}
                  onQuickGalleryUpload={handleQuickGalleryUpload}
                  onMarkComplete={handleMarkComplete}
                  onEditControlDays={handleEditControlDays}
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
          <button onClick={() => { const sel = trials.filter(t => selectedForBulk.has(t.ID)); exportMultipleTrialsToCSV(sel); }} className="flex items-center gap-1.5 text-sm hover:text-emerald-400 transition"><FileSpreadsheet className="w-4 h-4" />Export CSV</button>
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
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Date</label>
                <input type="date" value={bulkEditForm.Date} onChange={e => setBulkEditForm(p => ({...p, Date: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Dosage</label>
                <input type="text" value={bulkEditForm.Dosage} onChange={e => setBulkEditForm(p => ({...p, Dosage: e.target.value}))}
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
                if (bulkEditForm.Date) updates.Date = bulkEditForm.Date;
                if (bulkEditForm.Dosage.trim()) updates.Dosage = bulkEditForm.Dosage.trim();
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
                setBulkEditForm({ InvestigatorName: '', Location: '', Result: '', Notes: '', Date: '', Dosage: '' });
                setIsBulkEditOpen(false);
                clearBulk();
                window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `${ids.length} trials updated`, type: 'success' } }));
              }} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Apply to {selectedForBulk.size} Trials</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DUPLICATE MODAL ── */}
      {duplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Copy className="w-5 h-5 text-emerald-500" /> Duplicate Trial
              </h3>
              <button onClick={() => setDuplicateModal(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500">Copying from: <span className="font-semibold text-slate-700">{duplicateModal.FormulationName}</span></p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Select Formulation for New Trial *</label>
              <select
                value={duplicateFormulation}
                onChange={e => setDuplicateFormulation(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="">— Select formulation —</option>
                {formulations.map(f => <option key={f.ID} value={f.Name}>{f.Name}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">Or type a custom name:</p>
              <input
                type="text"
                value={duplicateFormulation}
                onChange={e => setDuplicateFormulation(e.target.value)}
                placeholder="Custom formulation name..."
                className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Date</label>
              <input
                type="date"
                value={duplicateDate}
                onChange={e => setDuplicateDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Dosage</label>
              <input
                type="text"
                value={duplicateDosage}
                onChange={e => setDuplicateDosage(e.target.value)}
                placeholder={`Leave blank to copy (${duplicateModal.Dosage || 'N/A'})`}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <p className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2 border">Location, weed species and other settings will be copied. Photos, observations and results will be cleared.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDuplicateModal(null)} className="px-4 py-2 text-sm rounded-lg border text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleDuplicateConfirm}
                disabled={!duplicateFormulation.trim()}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Duplicate
              </button>
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
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Application Timing</label>
              <select value={formData.ApplicationTiming} onChange={e => setFormData({...formData, ApplicationTiming: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">— Select Timing —</option>
                {['PRE', 'E-POST', 'POST', 'L-POST'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Weed Growth Stage</label>
              <input type="text" value={formData.WeedGrowthStage} onChange={e => setFormData({...formData, WeedGrowthStage: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. 2-4 leaf stage, tillering" />
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
                      ['App Timing', detailTrial.ApplicationTiming || '—', Clock],
                      ['Growth Stage', detailTrial.WeedGrowthStage || '—', Leaf],
                      ['Control Days', (() => { if (detailTrial.FinalControlDuration) return `${detailTrial.FinalControlDuration}d (finalized)`; if (!detailTrial.Date) return '—'; const d = Math.max(0, Math.round((new Date() - new Date(detailTrial.Date)) / 86400000)); return `${d}d (running)`; })(), Clock],
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
              {detailTab === 'observations' && (
                (() => {
                  const { sorted, baseCover } = obsData;
                  let controlDays = null;
                  if (detailTrial.ControlFinalized === true || detailTrial.ControlFinalized === 'true') {
                    if (detailTrial.FinalControlDuration) controlDays = `${detailTrial.FinalControlDuration} days (final)`;
                    else if (detailTrial.FinalizationDate && detailTrial.Date) {
                      const d = Math.floor((new Date(detailTrial.FinalizationDate) - new Date(detailTrial.Date)) / 86400000);
                      controlDays = `${Math.max(0, d)} days (final)`;
                    } else controlDays = 'Finalized';
                  } else if (detailTrial.Date) {
                    const d = Math.floor((new Date() - new Date(detailTrial.Date)) / 86400000);
                    controlDays = `${Math.max(0, d)} days active`;
                  }
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
                          const isBaseline = obs.daa === sorted[0]?.daa;
                          const wce = baseCover > 0 && !isBaseline ? Math.max(0, Math.min(100, (1 - cover / baseCover) * 100)) : null;
                          const wceRating = wce === null ? null : wce >= 85 ? 'Excellent' : wce >= 70 ? 'Good' : wce >= 50 ? 'Fair' : 'Poor';
                          const wceCls = wce === null ? '' : wce >= 85 ? 'text-emerald-700 bg-emerald-50' : wce >= 70 ? 'text-blue-700 bg-blue-50' : wce >= 50 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
                          const risks = getClimateRisks(obs.weatherTemp, obs.weatherWind, obs.weatherRain);
                          return (
                            <div key={idx} className="bg-white border rounded-xl p-4 shadow-sm">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="bg-slate-700 text-white font-bold px-2 py-1 rounded text-xs">DAA {obs.daa ?? 0}</span>
                                  <span className="text-xs text-slate-500">{obs.date ? formatPhotoDate(obs.date) : ''}</span>
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
                                  <p className="text-base font-bold">{wce !== null ? `${wce.toFixed(1)}%` : isBaseline ? 'Baseline' : '—'}</p>
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
                })()
              )}

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
                  {detailPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {detailPhotos.map((photo, idx) => {
                        const rawSrc = photo.fileData || photo.url || (typeof photo === 'string' ? photo : null);
                        if (!rawSrc) return null;
                        const driveMatch = typeof rawSrc === 'string' && rawSrc.includes('drive.google.com') && rawSrc.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
                        const src = driveMatch
                          ? `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w400`
                          : rawSrc;
                        return (
                          <div key={idx} className="rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex flex-col">
                            <div className="relative">
                              <img
                                src={src}
                                alt={`Photo ${idx + 1}`}
                                className="w-full aspect-square object-cover bg-slate-200"
                                onError={e => { e.target.onerror = null; e.target.src = rawSrc; }}
                              />
                              <div className="absolute top-1 right-1 flex gap-1">
                                <button
                                  onClick={() => handleAnalyzeSinglePhoto(src, photo.date)}
                                  disabled={!!aiGenRunning}
                                  title={aiGenRunning ? 'AI analysis running...' : 'AI Full Scan & Log'}
                                  className={`p-1.5 rounded-lg text-white shadow transition ${aiGenRunning ? 'bg-purple-400 cursor-wait' : 'bg-purple-600/90 hover:bg-purple-700'}`}>
                                  {aiGenRunning === src ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                </button>
                                <button onClick={() => handleDeletePhoto(idx)} title="Delete"
                                  className="p-1.5 bg-red-500/90 backdrop-blur rounded-lg text-white shadow">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="px-2 pt-1.5 pb-1">
                              <p className="text-xs font-semibold text-slate-700 truncate">{photo.label || `Photo ${idx+1}`}</p>
                              {photo.date && <p className="text-[10px] text-slate-400">{formatPhotoDate(photo.date)}</p>}
                            </div>
                            <div className="px-2 pb-2 flex gap-1 flex-wrap">
                              <button onClick={() => identifyWeedFromPhoto(src)} title="AI Weed ID"
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100">
                                <Leaf className="w-3 h-3" />Weed ID
                              </button>
                              <button onClick={() => detectWeedCoverAI(src)} title="Detect Weed Cover"
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100">
                                <ScanLine className="w-3 h-3" />Cover
                              </button>
                              <button onClick={() => handleCropExistingPhoto(idx, rawSrc)} title="Crop photo"
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                                <Crop className="w-3 h-3" />Crop
                              </button>
                              <button onClick={() => setPhotoEditModal({ idx, label: photo.label || '', date: toDatetimeLocal(photo.date || new Date()) })} title="Edit label/date"
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                                <Pencil className="w-3 h-3" />Edit
                              </button>
                              <button onClick={() => { const a = document.createElement('a'); a.href = rawSrc; a.download = photo.fileName || `photo-${idx+1}.jpg`; a.target = '_blank'; a.click(); }} title="Download"
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                                <Download className="w-3 h-3" />
                              </button>
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
              {detailTab === 'qr' && (() => {
                const liveUrl = buildPrintableTrialUrl(detailTrial);
                const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); } catch { return d||''; } };
                return (
                <div className="flex flex-col items-center gap-4 w-full">
                  {/* Mode picker */}
                  <div className="flex w-full rounded-xl overflow-hidden border border-slate-200">
                    {['offline','online'].map(m => (
                      <button key={m}
                        onClick={() => { setQrMode(m); setQrGenerated(false); }}
                        className={`flex-1 py-2 text-sm font-semibold capitalize transition-colors ${
                          qrMode === m ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                        }`}>
                        {m === 'offline' ? '📦 Offline QR' : '🌐 Online / Live QR'}
                      </button>
                    ))}
                  </div>

                  {/* Canvas */}
                  <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-sm">
                    <canvas ref={qrCanvasRef} className="block" />
                    {!qrGenerated && (
                      <div className="w-[220px] h-[220px] flex items-center justify-center text-slate-300 text-xs">
                        Click Generate to create QR
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button onClick={() => generateQR(detailTrial, qrMode)}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700">
                      <QrCode className="w-4 h-4" /> Generate QR
                    </button>
                    {qrGenerated && (
                      <button onClick={downloadQR}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200">
                        <Download className="w-4 h-4" /> Download PNG
                      </button>
                    )}
                  </div>

                  {/* Info panel */}
                  {qrMode === 'offline' ? (
                    <div className="w-full bg-slate-50 rounded-xl p-4 text-xs text-slate-600 border space-y-1">
                      <p className="font-bold text-slate-700 mb-2">📦 Offline QR — encoded data:</p>
                      <p><span className="font-semibold text-slate-500">Trial ID:</span> <span className="font-mono">{detailTrial?.ID}</span></p>
                      <p><span className="font-semibold text-slate-500">Product:</span> {detailTrial?.FormulationName}</p>
                      <p><span className="font-semibold text-slate-500">Date:</span> {fmtDate(detailTrial?.Date)}</p>
                      <p><span className="font-semibold text-slate-500">Dosage:</span> {detailTrial?.Dosage || '—'}</p>
                      <p><span className="font-semibold text-slate-500">Location:</span> {detailTrial?.Location || '—'}</p>
                      <p><span className="font-semibold text-slate-500">Weeds:</span> {detailTrial?.WeedSpecies || '—'}</p>
                      <p><span className="font-semibold text-slate-500">Replication:</span> {detailTrial?.Replication || '—'}</p>
                      <p className="mt-2 text-slate-400">Works without internet. Scan with Plot Scanner to open this trial.</p>
                    </div>
                  ) : (() => {
                    const LIVE_FIELDS = [
                      { key: 'showFormulationName', label: 'Product Name' },
                      { key: 'showInvestigator', label: 'Investigator' },
                      { key: 'showDate', label: 'Application Date' },
                      { key: 'showDosage', label: 'Dosage' },
                      { key: 'showLocation', label: 'Location' },
                      { key: 'showWeedSpecies', label: 'Target Weeds' },
                      { key: 'showResult', label: 'Result' },
                      { key: 'showWeather', label: 'Weather' },
                      { key: 'showIngredients', label: 'Ingredients' },
                      { key: 'showConclusion', label: 'Conclusion & Notes' },
                      { key: 'showPhotos', label: 'Field Photos' },
                      { key: 'showObservations', label: 'Observations / Efficacy' },
                      { key: 'showAISummary', label: 'AI Narrative' },
                      { key: 'showReplication', label: 'Replication' },
                    ];
                    const defaultOn = {
                      showFormulationName: true,
                      showInvestigator: true,
                      showDate: true,
                      showDosage: true,
                      showLocation: true,
                      showWeedSpecies: true,
                      showResult: true,
                      showWeather: true,
                      showIngredients: false,
                      showConclusion: true,
                      showPhotos: true,
                      showObservations: false,
                      showAISummary: false,
                      showReplication: false,
                    };
                    const globalOnlineRaw = state.settings?.qrOnlineFields;
                    const globalOnlineDefaults = Array.isArray(globalOnlineRaw)
                      ? {
                          ...defaultOn,
                          showFormulationName: globalOnlineRaw.includes('FormulationName'),
                          showInvestigator: globalOnlineRaw.includes('InvestigatorName'),
                          showDate: globalOnlineRaw.includes('Date'),
                          showDosage: globalOnlineRaw.includes('Dosage'),
                          showLocation: globalOnlineRaw.includes('Location'),
                          showWeedSpecies: globalOnlineRaw.includes('WeedSpecies'),
                          showResult: globalOnlineRaw.includes('Result'),
                          showWeather: globalOnlineRaw.includes('Weather'),
                          showConclusion: globalOnlineRaw.includes('Conclusion'),
                          showPhotos: globalOnlineRaw.includes('Photos'),
                        }
                      : (globalOnlineRaw && typeof globalOnlineRaw === 'object'
                        ? { ...defaultOn, ...globalOnlineRaw }
                        : defaultOn);
                    const rawLiveSettings = safeJsonParse(detailTrial?.LiveQRSettings, {});
                    const liveSettings = {
                      ...globalOnlineDefaults,
                      ...rawLiveSettings,
                      ...(Object.prototype.hasOwnProperty.call(rawLiveSettings, 'showInvestigatorName')
                        ? { showInvestigator: rawLiveSettings.showInvestigatorName }
                        : {}),
                    };

                    const handleToggleLiveField = async (fieldKey) => {
                      const updated = { ...liveSettings, [fieldKey]: !liveSettings[fieldKey] };
                      const updatedTrial = { ...detailTrial, LiveQRSettings: JSON.stringify(updated) };
                      // Optimistic UI update
                      updateState({ trials: trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
                      setActiveTrial(updatedTrial);
                      try {
                        await updateTrial({ ID: updatedTrial.ID, LiveQRSettings: updatedTrial.LiveQRSettings }, getAppState);
                        await syncTrialToQrScript({ ID: updatedTrial.ID, LiveQRSettings: updatedTrial.LiveQRSettings });
                      } catch (e) {
                        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Could not save: ' + e.message, type: 'error' } }));
                      }
                    };

                    return (
                      <div className="w-full space-y-3">
                        <div className="bg-blue-50 rounded-xl p-4 text-xs text-blue-800 border border-blue-200 space-y-2">
                          <p className="font-bold text-blue-700 mb-1">🌐 Online / Live QR — links to:</p>
                          <p className="font-mono break-all text-blue-600 bg-blue-100 rounded p-2">{liveUrl}</p>
                          <p>Anyone with this QR can view live trial data directly from Firebase — no login required.</p>
                        </div>
                        <div className="w-full bg-white rounded-xl border border-slate-200 p-4">
                          <p className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                            Control what visitors see — changes save instantly to Firebase
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {LIVE_FIELDS.map(({ key, label }) => (
                              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                                <div
                                  onClick={() => handleToggleLiveField(key)}
                                  className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
                                    liveSettings[key] ? 'bg-emerald-500' : 'bg-slate-300'
                                  }`}
                                >
                                  <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                                    liveSettings[key] ? 'translate-x-4' : 'translate-x-0'
                                  }`} />
                                </div>
                                <span className={`text-xs ${liveSettings[key] ? 'text-slate-700 font-semibold' : 'text-slate-400 line-through'}`}>
                                  {label}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                );
              })()}

              {/* AI Summary Tab */}
              {detailTab === 'ai' && (() => {
                const savedAi = safeJsonParse(detailTrial?.AISummariesJSON, {});
                const currentObsCount = validateEfficacyData(safeJsonParse(detailTrial?.EfficacyDataJSON, [])).length;
                const isStale = savedAi.narrative && savedAi.narrativeObsCount != null && currentObsCount > savedAi.narrativeObsCount;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-700 flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-violet-500" /> AI Trial Narrative</h3>
                      <button onClick={generateAiSummary} disabled={aiLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
                        {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {aiLoading ? 'Generating...' : (savedAi.narrative ? 'Regenerate' : 'Generate Summary')}
                      </button>
                    </div>
                    {isStale && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-xs text-amber-800">
                        <span className="mt-0.5">⚠</span>
                        <span><strong>{currentObsCount - (savedAi.narrativeObsCount ?? 0)} new observation{currentObsCount - (savedAi.narrativeObsCount ?? 0) !== 1 ? 's' : ''} added</strong> since this narrative was generated. Click <strong>Regenerate</strong> to update before exporting.</span>
                      </div>
                    )}
                    {savedAi.anomalies && savedAi.anomalies.trim() !== '' && savedAi.anomalies.toLowerCase().trim() !== 'none' && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-800">
                        <span className="mt-0.5">⚠</span>
                        <div>
                          <strong className="block mb-1">Detected Observation Anomalies (Excluded from Official Report):</strong>
                          <span className="whitespace-pre-wrap">{savedAi.anomalies}</span>
                        </div>
                      </div>
                    )}
                    {aiSummary ? (
                      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {aiSummary}
                        {savedAi.narrativeGeneratedAt && (
                          <p className="mt-3 pt-2 border-t border-violet-200 text-[11px] text-violet-400">
                            Generated {new Date(savedAi.narrativeGeneratedAt).toLocaleString()} · based on {savedAi.narrativeObsCount} observation{savedAi.narrativeObsCount !== 1 ? 's' : ''}
                          </p>
                        )}
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
                );
              })()}

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
              <button onClick={() => handleAnalyzeAllPhotos()} className="px-4 py-2 text-sm font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 shadow-lg flex items-center gap-2">
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
              <input
                type="number"
                required
                min="0"
                value={obsForm.daa}
                onChange={e => {
                  const val = e.target.value;
                  let newDate = obsForm.date;
                  if (val !== '' && activeTrial?.Date) {
                    const parsed = toDateKey(activeTrial.Date);
                    if (parsed) {
                      const [y, m, d] = parsed.split('-').map(Number);
                      const baseDate = new Date(Date.UTC(y, m - 1, d));
                      baseDate.setUTCDate(baseDate.getUTCDate() + parseInt(val, 10));
                      const ry = baseDate.getUTCFullYear();
                      const rm = String(baseDate.getUTCMonth() + 1).padStart(2, '0');
                      const rd = String(baseDate.getUTCDate()).padStart(2, '0');
                      newDate = `${ry}-${rm}-${rd}`;
                    }
                  }
                  setObsForm({ ...obsForm, daa: val, date: newDate });
                }}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Date</label>
              <input
                type="date"
                required
                value={obsForm.date}
                onChange={e => {
                  const val = e.target.value;
                  const computedDaa = activeTrial?.Date ? calculateDAA(val, activeTrial.Date) : obsForm.daa;
                  setObsForm({ ...obsForm, date: val, daa: computedDaa });
                }}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
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

      {/* ── CROPPER MODAL ── */}
      <CropperModal
        isOpen={cropperOpen}
        imageSrc={cropSource}
        onClose={() => { setCropperOpen(false); setCropSource(null); cropCallbackRef.current = null; }}
        onCropComplete={handleCropComplete}
      />

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
              <input type="datetime-local" value={photoEditModal.date} onChange={e => setPhotoEditModal(p => ({...p, date: e.target.value}))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button onClick={() => setPhotoEditModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
              <button onClick={handleSavePhotoEdit} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PHOTO DATE PROMPT MODAL ── */}
      {pendingPhotoAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" /> When was this photo taken?
              </h3>
              <button onClick={() => setPendingPhotoAnalysis(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500">The date determines the <strong>Days After Application (DAA)</strong> for the observation record.</p>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Photo Date</label>
              <input type="datetime-local"
                value={pendingPhotoAnalysis.date}
                max={toDatetimeLocal(new Date())}
                onChange={e => setPendingPhotoAnalysis(p => ({ ...p, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            {(() => {
              const targetTrialForPhoto = pendingPhotoAnalysis.targetTrial || activeTrial;
              return targetTrialForPhoto?.Date && pendingPhotoAnalysis.date ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800">
                  DAA: <strong>{Math.max(0, Math.round((new Date(pendingPhotoAnalysis.date) - new Date(targetTrialForPhoto.Date)) / 86400000))}</strong> days after application
                  {targetTrialForPhoto?.Lat && targetTrialForPhoto?.Lon && <span className="ml-2 text-emerald-600">• Weather will be auto-fetched</span>}
                </div>
              ) : null;
            })()}
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button onClick={() => setPendingPhotoAnalysis(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
              <button
                onClick={() => {
                  const { dataUrl, date, targetTrial } = pendingPhotoAnalysis;
                  setPendingPhotoAnalysis(null);
                  saveAndAnalyzePhoto(dataUrl, date, targetTrial);
                }}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> Analyse Photo
              </button>
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
                  <li>QR code linked to the trial report</li>
                  <li>Formulation name</li>
                  <li>Investigator and date</li>
                  <li>Dosage and optional company logo</li>
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
                onClick={() => { generateBulkQrCardsLegacy(); setIsBulkQrModalOpen(false); }}
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
      {isCameraOpen && (() => {
        const currentTrial = quickActionTrialRef.current || activeTrial;
        const liveSettings = currentTrial ? safeJsonParse(currentTrial.LiveQRSettings, {}) : {};
        const initialAspect = liveSettings.cameraAspectRatio || '3:4';
        return (
          <CameraCapture
            onCapture={handleCapturePhoto}
            onClose={() => setIsCameraOpen(false)}
            initialAspectRatio={initialAspect}
            onAspectChange={async (ratio) => {
              if (currentTrial) {
                const updatedSettings = { ...safeJsonParse(currentTrial.LiveQRSettings, {}), cameraAspectRatio: ratio };
                const updatedTrial = { ...currentTrial, LiveQRSettings: JSON.stringify(updatedSettings) };
                
                // Optimistic UI update
                updateState({ trials: trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
                if (activeTrial && activeTrial.ID === currentTrial.ID) {
                  setActiveTrial(updatedTrial);
                }
                
                try {
                  await updateTrial({ ID: currentTrial.ID, LiveQRSettings: updatedTrial.LiveQRSettings }, getAppState);
                } catch (e) {
                  console.warn("Failed to sync aspect ratio to Firebase", e);
                }
              }
            }}
          />
        );
      })()}

      {/* ── GRID WEED COVER TOOL ── */}
      {isGridOpen && (() => {
        const photos = safeJsonParse(activeTrial?.PhotoURLs, []);
        const lastPhoto = photos.length ? photos[photos.length - 1] : null;
        const imgUrl = lastPhoto?.url || lastPhoto?.fileData || null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <Grid className="w-4 h-4 text-blue-600" /> Grid Weed Cover Tool
                </h2>
                <button onClick={() => setIsGridOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 flex-1">
                {!imgUrl && (
                  <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                    No photo found for this trial. Upload a photo first, then use the Grid Tool to measure weed cover.
                  </p>
                )}
                <GridWeedCoverTool
                  imageUrl={imgUrl}
                  onUpdate={(data) => setGridCoverPct(data.cover ?? 0)}
                />
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
                <button onClick={() => setIsGridOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  onClick={() => { handleGridResult(gridCoverPct); setGridCoverPct(0); }}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Confirm Cover ({gridCoverPct}%)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
    </div>
  );
}
