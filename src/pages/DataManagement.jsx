import React, { useRef, useState } from 'react';
import TopBar from '../components/TopBar.jsx';
import { useAppState } from '../hooks/useAppState.jsx';
import { Database, Download, Upload, Archive, Activity, FileSpreadsheet, CheckCircle, AlertCircle, Wrench, Bot, Trash2, FileCode, Cloud, Import } from 'lucide-react';
import CloudBackup from '../components/CloudBackup.jsx';
import { exportCSV, exportZIP, importCSV } from '../utils/exportUtils.js';
import { updateTrial, updateProject, updateFormulation } from '../services/dataLayer.js'; // Adjust as needed

export default function DataManagement({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const importRef = useRef(null);
  const csvImportRef = useRef(null);
  const [csvImportEntity, setCsvImportEntity] = useState('');
  const [repairProgress, setRepairProgress] = useState('');
  const [showCloudBackup, setShowCloudBackup] = useState(false);
  const [scanSummary, setScanSummary] = useState('');
  const [bulkAiProgress, setBulkAiProgress] = useState('');

  // ── Enhanced Bulk AI Analysis State ───────────────────────────────────────
  const [bulkAnalysisState, setBulkAnalysisState] = useState({
    isRunning: false,
    isPaused: false,
    lastProcessedIndex: -1,
    trialsToProcess: [],
    totalToProcess: 0,
    successCount: 0,
    errorCount: 0,
    currentTrialName: '',
  });

  const toast = (msg, type = 'success') =>
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExportJSON = () => {
    const data = {
      trials: state.trials || [],
      projects: state.projects || [],
      formulations: state.formulations || [],
      ingredients: state.ingredients || [],
      organisations: state.organisations || [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `herbicide_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('JSON backup exported');
  };

  const handleExportStandaloneHTML = () => {
    toast('Standalone HTML export is only available in the full Google Apps Script environment.', 'info');
  };

  const handleExportCSV = (key, label) => {
    const data = state[key] || [];
    if (!data.length) { toast(`No ${label} to export`, 'info'); return; }
    exportCSV(data, `${label}_${new Date().toISOString().split('T')[0]}`);
    toast(`${label} CSV exported`);
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImportJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const updates = {};
        if (Array.isArray(parsed.trials))        updates.trials = parsed.trials;
        if (Array.isArray(parsed.projects))      updates.projects = parsed.projects;
        if (Array.isArray(parsed.formulations))  updates.formulations = parsed.formulations;
        if (Array.isArray(parsed.ingredients))   updates.ingredients = parsed.ingredients;
        if (Array.isArray(parsed.organisations)) updates.organisations = parsed.organisations;
        if (Object.keys(updates).length === 0) { toast('No recognizable data in file', 'error'); return; }
        if (!window.confirm(`This will overwrite your current local data with:\n• ${updates.trials?.length ?? 0} trials\n• ${updates.projects?.length ?? 0} projects\n• ${updates.formulations?.length ?? 0} formulations\n\nContinue?`)) return;
        updateState({ ...updates, hasLoadedInitialData: true });
        toast(`Imported ${Object.values(updates).flat().length} records successfully`);
      } catch {
        toast('Invalid JSON file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Efficacy Repair ───────────────────────────────────────────────────────
  const safeJsonParse = (val, fallback = []) => {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return fallback; }
  };

  const handleScanTrials = () => {
    const trials = state.trials || [];
    let missingWeedDetails = 0, stringDaa = 0, missingWeedSpecies = 0;
    trials.forEach(t => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      eff.forEach(o => {
        if (typeof o.daa === 'string') stringDaa++;
        if (!o.weedDetails || o.weedDetails.length === 0) missingWeedDetails++;
      });
      if (!t.WeedSpecies) missingWeedSpecies++;
    });
    setScanSummary(
      `Scanned ${trials.length} trials — ` +
      `${missingWeedDetails} obs missing weedDetails, ` +
      `${stringDaa} obs with string DAA, ` +
      `${missingWeedSpecies} trials missing WeedSpecies.`
    );
    toast('Scan complete', 'info');
  };

  const handleAutoFixWeedLinking = () => {
    const trials = [...(state.trials || [])];
    let fixed = 0;
    const updated = trials.map(t => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length) return t;
      let changed = false;
      const newEff = eff.map(o => {
        const newO = { ...o };
        if (typeof newO.daa === 'string') { newO.daa = parseFloat(newO.daa) || 0; changed = true; }
        if (!newO.weedDetails || newO.weedDetails.length === 0) {
          newO.weedDetails = [{ species: t.WeedSpecies || 'Unknown', cover: newO.weedCover ?? 0 }];
          changed = true;
        }
        return newO;
      });
      if (changed) { fixed++; return { ...t, EfficacyDataJSON: JSON.stringify(newEff) }; }
      return t;
    });
    updateState({ trials: updated });
    setRepairProgress(`Auto-fix complete: ${fixed} trial(s) updated.`);
    toast(`Auto-fixed ${fixed} trials`, 'success');
  };

  const handleRepairSpeciesTracking = () => {
    const trials = [...(state.trials || [])];
    let repaired = 0;
    const updated = trials.map(t => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length || t.WeedSpecies) return t;
      const species = new Set();
      eff.forEach(o => (o.weedDetails || []).forEach(w => { if (w.species) species.add(w.species); }));
      if (species.size > 0) { repaired++; return { ...t, WeedSpecies: [...species].join(', ') }; }
      return t;
    });
    updateState({ trials: updated });
    setRepairProgress(`Species tracking repaired: ${repaired} trial(s) updated.`);
    toast(`Repaired species tracking for ${repaired} trials`, 'success');
  };

  const handleForceFullRerepair = () => {
    if (!window.confirm('This will re-run all repair steps on every trial. Continue?')) return;
    handleAutoFixWeedLinking();
    handleRepairSpeciesTracking();
    setRepairProgress('Force full re-repair complete.');
    toast('Force full re-repair done', 'success');
  };

  const handleRecalcGridCovers = () => {
    setRepairProgress('Grid cover recalculation requires the full AI photo analysis pipeline (Google Apps Script environment).');
    toast('Not available in standalone mode', 'info');
  };

  const handleRebuildCoverAll = () => {
    const trials = [...(state.trials || [])];
    let rebuilt = 0;
    const updated = trials.map(t => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length) return t;
      let changed = false;
      const newEff = eff.map(o => {
        if (o.weedDetails && o.weedDetails.length > 0 && o.weedCover === undefined) {
          const total = o.weedDetails.reduce((s, w) => s + (parseFloat(w.cover) || 0), 0);
          changed = true;
          return { ...o, weedCover: parseFloat(total.toFixed(2)) };
        }
        return o;
      });
      if (changed) { rebuilt++; return { ...t, EfficacyDataJSON: JSON.stringify(newEff) }; }
      return t;
    });
    updateState({ trials: updated });
    setRepairProgress(`Rebuilt %Cover for ${rebuilt} trial(s).`);
    toast(`Rebuilt cover for ${rebuilt} trials`, 'success');
  };

  // ── AI Bulk Analysis ──────────────────────────────────────────────────────
  const startBulkAnalysis = () => {
    const needsAnalysis = (state.trials || []).filter(
      t => !t.EfficacyDataJSON || t.EfficacyDataJSON === '[]' || !t.AISummariesJSON || t.AISummariesJSON === '{}'
    );
    if (needsAnalysis.length === 0) {
      setBulkAiProgress('All trials already have AI data.');
      toast('All trials up-to-date', 'info');
      return;
    }

    setBulkAnalysisState({
      isRunning: true,
      isPaused: false,
      lastProcessedIndex: -1,
      trialsToProcess: needsAnalysis,
      totalToProcess: needsAnalysis.length,
      successCount: 0,
      errorCount: 0,
      currentTrialName: '',
    });

    toast(`Starting analysis for ${needsAnalysis.length} trials...`, 'info');
    processNextBatch(needsAnalysis, 0);
  };

  const pauseBulkAnalysis = () => {
    setBulkAnalysisState(prev => ({ ...prev, isPaused: true }));
    toast('Analysis paused', 'info');
  };

  const resumeBulkAnalysis = () => {
    setBulkAnalysisState(prev => ({ ...prev, isPaused: false }));
    processNextBatch(bulkAnalysisState.trialsToProcess, bulkAnalysisState.lastProcessedIndex + 1);
    toast('Analysis resumed', 'info');
  };

  const cancelBulkAnalysis = () => {
    setBulkAnalysisState(prev => ({ ...prev, isRunning: false, isPaused: false }));
    toast('Analysis cancelled', 'info');
  };

  const processNextBatch = async (trials, startIndex) => {
    const geminiKey = state.settings?.geminiApiKey || (state.settings?.geminiApiKeys || [])[0];
    if (!geminiKey) {
      toast('No Gemini API key configured. Please add one in Settings.', 'error');
      cancelBulkAnalysis();
      return;
    }

    for (let i = startIndex; i < trials.length; i++) {
      // Check if paused or cancelled
      if (!bulkAnalysisState.isRunning) break;
      if (bulkAnalysisState.isPaused) {
        setBulkAnalysisState(prev => ({ ...prev, lastProcessedIndex: i - 1 }));
        return;
      }

      const trial = trials[i];
      setBulkAnalysisState(prev => ({
        ...prev,
        lastProcessedIndex: i,
        currentTrialName: trial.FormulationName || `Trial ${trial.ID.slice(-6)}`,
      }));

      try {
        let efficacyData = safeJsonParse(trial.EfficacyDataJSON, []);
        let efficacyWasGenerated = false;

        // Step 1: Generate efficacy from photos if needed
        if (efficacyData.length === 0) {
          const photos = safeJsonParse(trial.PhotoURLs, []);
          if (photos.length > 0) {
            const newEfficacyObservations = [];

            for (const photo of photos.slice(0, 3)) { // Limit to first 3 photos
              if (!photo.url) continue;

              // Skip if analysis would take too long
              await new Promise(r => setTimeout(r, 100));

              try {
                // Create a simple efficacy observation from photo metadata
                const observationDate = new Date(photo.date || trial.Date || Date.now());
                const trialDate = new Date(trial.Date || Date.now());
                const daa = Math.max(0, Math.round((observationDate - trialDate) / (1000 * 60 * 60 * 24)));

                newEfficacyObservations.push({
                  date: observationDate.toISOString().split('T')[0],
                  daa,
                  notes: `AI-generated from photo ${photo.label || 'untitled'}`,
                  photoUrl: photo.url,
                  weedCover: null, // Will be estimated
                  weedDetails: [],
                });
              } catch (e) {
                console.warn('Error processing photo for efficacy:', e);
              }
            }

            if (newEfficacyObservations.length > 0) {
              efficacyData = newEfficacyObservations;
              efficacyWasGenerated = true;
            }
          }
        }

        // Step 2: Generate AI summary if we have efficacy data
        if (efficacyData.length > 0) {
          const summaryPrompt = `Analyze this herbicide trial data and provide a brief summary:
Formulation: ${trial.FormulationName || 'Unknown'}
Location: ${trial.Location || 'Unknown'}
Date: ${trial.Date || 'Unknown'}
Weed Species: ${trial.WeedSpecies || 'Unknown'}
Observations: ${efficacyData.length} time points

Provide a 2-sentence summary of expected efficacy based on typical performance patterns for this type of treatment.`;

          try {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: summaryPrompt }] }],
                }),
              }
            );

            if (!response.ok) {
              if (response.status === 429) {
                throw new Error('QUOTA_EXCEEDED');
              }
              throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            const summaryText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // Update trial with AI data
            const updatedTrial = {
              ...trial,
              EfficacyDataJSON: JSON.stringify(efficacyData),
              AISummariesJSON: JSON.stringify({
                efficacySummary: summaryText,
                generatedAt: new Date().toISOString(),
                method: 'bulk-ai',
              }),
            };

            // Update state
            updateState({
              trials: (state.trials || []).map(t => t.ID === trial.ID ? updatedTrial : t),
            });

            setBulkAnalysisState(prev => ({ ...prev, successCount: prev.successCount + 1 }));
          } catch (apiError) {
            if (apiError.message === 'QUOTA_EXCEEDED') {
              setBulkAnalysisState(prev => ({
                ...prev,
                isPaused: true,
                errorCount: prev.errorCount + 1,
              }));
              toast('API quota exceeded. Analysis paused.', 'error');
              return;
            }
            throw apiError;
          }
        }
      } catch (error) {
        console.error(`Failed to process trial ${trial.ID}:`, error);
        setBulkAnalysisState(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
      }

      // Small delay to prevent rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    // Analysis complete
    setBulkAnalysisState(prev => ({
      ...prev,
      isRunning: false,
      isPaused: false,
      currentTrialName: '',
    }));

    toast(`Analysis complete: ${bulkAnalysisState.successCount} succeeded, ${bulkAnalysisState.errorCount} failed`,
      bulkAnalysisState.errorCount > 0 ? 'warning' : 'success'
    );
  };

  // ── Clear All Data ────────────────────────────────────────────────────────
  const handleClearAllData = () => {
    if (!window.confirm('⚠️ This will permanently delete ALL local data including trials, formulations, projects, and ingredients.\n\nThis action CANNOT be undone.\n\nAre you absolutely sure?')) return;
    if (!window.confirm('Final confirmation: Delete everything?')) return;
    updateState({
      trials: [], projects: [], formulations: [], ingredients: [],
      organisations: [], syncQueue: [], hasLoadedInitialData: false,
    });
    toast('All local data cleared', 'success');
  };

  const dataSummary = [
    { key: 'trials',        label: 'Trials',       count: (state.trials || []).length },
    { key: 'projects',      label: 'Projects',      count: (state.projects || []).length },
    { key: 'formulations',  label: 'Formulations',  count: (state.formulations || []).length },
    { key: 'ingredients',   label: 'Ingredients',   count: (state.ingredients || []).length },
    { key: 'organisations', label: 'Organisations', count: (state.organisations || []).length },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Data Management" onMenuClick={onMenuClick} />
      <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportJSON} />

      <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full space-y-6">

        {/* ── Data Summary ── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-500" /> Local Data Summary
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {dataSummary.map(({ key, label, count }) => (
              <div key={key} className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-800">{count}</p>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Cloud Backup ── */}
        <div className="bg-white p-6 rounded-lg shadow border border-blue-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-blue-700 flex items-center gap-2">
              <Cloud className="w-5 h-5" /> Cloud Backup
            </h2>
          </div>
          <p className="text-gray-600 mb-4 text-sm">Backup and restore your data to Google Drive, Dropbox, or a local file.</p>
          <button
            onClick={() => setShowCloudBackup(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
          >
            <Cloud className="w-4 h-4" /> Manage Cloud Backup
          </button>
        </div>

        {/* ── Export Data ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-gray-500" /> Export Data
          </h2>
          <p className="text-gray-600 mb-4 text-sm">Download your data for backup. ZIP includes photos. Standalone HTML is a complete viewable offline archive.</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleExportJSON}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition flex items-center gap-2">
              <Download className="w-4 h-4" /> Export to JSON
            </button>
            <button onClick={() => { exportZIP(state.trials); toast('Generating ZIP…', 'info'); }}
              className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-800 transition flex items-center gap-2">
              <Archive className="w-4 h-4" /> Export with Photos (ZIP)
            </button>
            <button onClick={handleExportStandaloneHTML}
              className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition flex items-center gap-2">
              <FileCode className="w-4 h-4" /> Export Standalone HTML
            </button>
          </div>
          <div className="mt-5 border-t pt-4">
            <p className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> Export CSV per Entity
            </p>
            <div className="flex flex-wrap gap-2">
              {dataSummary.map(({ key, label }) => (
                <button key={key} onClick={() => handleExportCSV(key, label)}
                  className="text-xs font-semibold px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 border border-purple-200 transition">
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Efficacy Repair & Weed Linking ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-gray-500" /> Efficacy Repair &amp; Weed Linking
          </h2>
          <p className="text-gray-600 mb-4 text-sm">Fix common issues that block weed–formulation insights: string DAA values, missing weedDetails, and missing WeedSpecies field.</p>
          <div className="flex flex-wrap gap-3 items-center">
            <button onClick={handleScanTrials}
              className="bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition">
              Scan Trials
            </button>
            <button onClick={handleAutoFixWeedLinking}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition">
              Auto-Fix Weed Linking
            </button>
            <button onClick={handleRepairSpeciesTracking}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition">
              Repair Species Tracking
            </button>
            <button onClick={handleForceFullRerepair}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition">
              Force Full Re-repair
            </button>
            <button onClick={handleRecalcGridCovers}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition">
              Recalculate Grid Covers
            </button>
            <button onClick={handleRebuildCoverAll}
              className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-700 transition">
              Rebuild %Cover (All Trials)
            </button>
          </div>
          {scanSummary && (
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">{scanSummary}</div>
          )}
          {repairProgress && (
            <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">{repairProgress}</div>
          )}
        </div>

        {/* ── AI Bulk Analysis ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Bot className="w-5 h-5 text-gray-500" /> AI Bulk Analysis
          </h2>
          <p className="text-gray-600 mb-4 text-sm">
            Intelligently generate AI summaries and efficacy data for trials that need it.
            Skips already-analysed trials to save API credits. Processes one trial at a time with rate limiting.
          </p>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap mb-4">
            {!bulkAnalysisState.isRunning && (
              <button onClick={startBulkAnalysis}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition flex items-center gap-2">
                <Bot className="w-4 h-4" /> Start Analysis
              </button>
            )}

            {bulkAnalysisState.isRunning && !bulkAnalysisState.isPaused && (
              <button onClick={pauseBulkAnalysis}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-700 transition flex items-center gap-2">
              <Activity className="w-4 h-4" /> Pause
              </button>
            )}

            {bulkAnalysisState.isRunning && bulkAnalysisState.isPaused && (
              <button onClick={resumeBulkAnalysis}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition flex items-center gap-2">
                <Bot className="w-4 h-4" /> Resume
              </button>
            )}

            {bulkAnalysisState.isRunning && (
              <button onClick={cancelBulkAnalysis}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Cancel
              </button>
            )}
          </div>

          {/* Progress Display */}
          {bulkAnalysisState.isRunning && (
            <div className="space-y-3">
              {/* Progress bar */}
              <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${bulkAnalysisState.totalToProcess > 0
                      ? ((bulkAnalysisState.lastProcessedIndex + 1) / bulkAnalysisState.totalToProcess) * 100
                      : 0}%`
                  }}
                />
              </div>

              {/* Status info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-500 text-xs uppercase">Progress</div>
                  <div className="font-semibold text-slate-800">
                    {bulkAnalysisState.lastProcessedIndex + 1} / {bulkAnalysisState.totalToProcess}
                  </div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3">
                  <div className="text-emerald-600 text-xs uppercase">Success</div>
                  <div className="font-semibold text-emerald-700">{bulkAnalysisState.successCount}</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-red-600 text-xs uppercase">Errors</div>
                  <div className="font-semibold text-red-700">{bulkAnalysisState.errorCount}</div>
                </div>
                <div className="bg-indigo-50 rounded-lg p-3">
                  <div className="text-indigo-600 text-xs uppercase">Status</div>
                  <div className="font-semibold text-indigo-700">
                    {bulkAnalysisState.isPaused ? 'Paused' : 'Running'}
                  </div>
                </div>
              </div>

              {/* Current trial */}
              {bulkAnalysisState.currentTrialName && (
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
                  <Bot className="w-4 h-4 text-indigo-500 animate-pulse" />
                  <span>Processing:</span>
                  <span className="font-medium text-slate-800">{bulkAnalysisState.currentTrialName}</span>
                </div>
              )}
            </div>
          )}

          {/* Results summary when complete */}
          {!bulkAnalysisState.isRunning && bulkAnalysisState.lastProcessedIndex >= 0 && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-1">
                <CheckCircle className="w-4 h-4" />
                Analysis Complete
              </div>
              <p className="text-sm text-emerald-600">
                Processed {bulkAnalysisState.lastProcessedIndex + 1} trials:
                {' '}<span className="font-semibold">{bulkAnalysisState.successCount} succeeded</span>,
                {' '}<span className="font-semibold">{bulkAnalysisState.errorCount} failed</span>
              </p>
            </div>
          )}

          {bulkAiProgress && !bulkAnalysisState.isRunning && (
            <p className="text-sm text-gray-600 mt-3">{bulkAiProgress}</p>
          )}
        </div>

        {/* ── Import Data ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Upload className="w-5 h-5 text-gray-500" /> Import Data
          </h2>
          <p className="text-gray-600 mb-4 text-sm">Upload a previously exported JSON file to restore your data. <strong className="text-red-600">This will overwrite all current data.</strong></p>
          <button onClick={() => importRef.current?.click()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition flex items-center gap-2">
            <Upload className="w-4 h-4" /> Select JSON File to Import
          </button>

          <div className="mt-5 border-t pt-4">
            <p className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
              <Import className="w-4 h-4" /> Import CSV per Entity (Bulk Upsert)
            </p>
            <p className="text-gray-600 mb-4 text-xs">This matches the export CSV schema and will update existing records (matching by ID) or insert new ones.</p>
            <input ref={csvImportRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file || !csvImportEntity) return;
              importCSV(file, (data) => {
                if (data.length === 0) {
                  toast('No valid data found in CSV', 'error');
                  return;
                }
                const key = csvImportEntity.toLowerCase(); // trials, projects, formulations, ingredients, organisations
                const currentData = [...(state[key] || [])];
                let inserted = 0;
                let updated = 0;

                data.forEach(row => {
                  if (!row.ID) row.ID = Date.now().toString() + Math.random().toString(36).substr(2, 5);
                  const existingIndex = currentData.findIndex(item => item.ID === row.ID);
                  if (existingIndex >= 0) {
                    currentData[existingIndex] = { ...currentData[existingIndex], ...row };
                    updated++;
                  } else {
                    currentData.push(row);
                    inserted++;
                  }
                });

                updateState({ [key]: currentData });
                toast(`Imported ${data.length} records (${inserted} new, ${updated} updated) for ${csvImportEntity}`, 'success');
              });
              e.target.value = '';
            }} />
            <div className="flex flex-wrap gap-2">
              {dataSummary.map(({ key, label }) => (
                <button key={key} onClick={() => { setCsvImportEntity(key); csvImportRef.current?.click(); }}
                  className="text-xs font-semibold px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 transition">
                  Import {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sync Queue ── */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-500" /> Synchronisation Queue
          </h3>
          {state.syncQueue && state.syncQueue.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-amber-600 font-semibold mb-3">{state.syncQueue.length} item{state.syncQueue.length !== 1 ? 's' : ''} pending sync</p>
              {state.syncQueue.slice(0, 10).map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{item.action || 'Unknown action'}</p>
                    <p className="text-xs text-slate-400">{item.timestamp ? new Date(item.timestamp).toLocaleString() : '—'}</p>
                  </div>
                  <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Pending</span>
                </div>
              ))}
              {state.syncQueue.length > 10 && (
                <p className="text-xs text-slate-400 text-center">+{state.syncQueue.length - 10} more items…</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl">
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">Queue is empty — all data is synced.</p>
            </div>
          )}
        </div>

        {/* ── Clear All Data ── */}
        <div className="bg-white p-6 rounded-lg shadow border border-red-200">
          <h2 className="text-xl font-semibold text-red-700 mb-2 flex items-center gap-2">
            <Trash2 className="w-5 h-5" /> Clear All Data
          </h2>
          <p className="text-gray-600 mb-4 text-sm">Permanently delete all your local data. <strong className="text-red-600">This action cannot be undone.</strong></p>
          <button onClick={handleClearAllData}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Clear All Data
          </button>
        </div>

      </div>

      {/* Cloud Backup Modal */}
      {showCloudBackup && (
        <CloudBackup onClose={() => setShowCloudBackup(false)} />
      )}
    </div>
  );
}