import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addProject, deleteProject, addBlock, updateProject } from '../services/dataLayer.js';
import {
  Plus, Trash2, Layers, Beaker, Activity, ChevronRight, ArrowLeft,
  Lock, Unlock, Download, FileText, RefreshCw, BarChart2, Shuffle,
  ClipboardList, Package, Sparkles, Save, Loader2, CheckCircle2,
  AlertTriangle, AlertCircle, ShieldAlert, LayoutGrid, TrendingUp,
  Sigma, Printer, MapPin
} from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { AnalysisEngine } from '../utils/analysisUtils.js';
import PlotMap from '../components/PlotMap.jsx';
import { formatDate, formatDateTime, toDatetimeLocal } from '../utils/dateUtils.js';

// ── helpers ────────────────────────────────────────────────────────────────
const INPUT = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white';
const toast = (msg, type = 'success') =>
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));

function MiniBar({ value, max, color = 'bg-emerald-500' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Inline bar chart — no external lib
function InlineBarChart({ data, color = '#10b981', height = 120 }) {
  if (!data || data.length === 0) return <p className="text-xs text-slate-400 text-center py-4">No data</p>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group min-w-0">
          <span className="text-[8px] text-slate-400 hidden group-hover:block truncate">{d.value.toFixed(1)}</span>
          <div
            className="w-full rounded-t transition-all hover:opacity-80"
            style={{ height: `${Math.max(4, (d.value / max) * (height - 20))}px`, background: color }}
            title={`${d.label}: ${d.value.toFixed(1)}`}
          />
          <span className="text-[8px] text-slate-400 truncate w-full text-center leading-tight">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Plot mini card ─────────────────────────────────────────────────────────
function PlotMiniCard({ trial }) {
  const isControl = String(trial.IsControl).toLowerCase() === 'true';
  const isCheck = String(trial.IsStandardCheck).toLowerCase() === 'true';
  const isCompleted = String(trial.IsCompleted).toLowerCase() === 'true';

  const bg = isControl ? 'bg-orange-50 border-orange-300' : isCheck ? 'bg-purple-50 border-purple-300' : 'bg-blue-50 border-blue-200';
  const ribbon = isControl ? 'bg-orange-500' : isCheck ? 'bg-purple-500' : 'bg-blue-500';
  const badge = isControl
    ? <span className="text-[7px] font-extrabold bg-orange-500 text-white px-1 py-0.5 rounded uppercase">Control</span>
    : isCheck
      ? <span className="text-[7px] font-extrabold bg-purple-500 text-white px-1 py-0.5 rounded uppercase">Standard</span>
      : <span className="text-[7px] font-extrabold bg-blue-500 text-white px-1 py-0.5 rounded uppercase">Exptl</span>;

  const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
  const latest = efficacy.length ? efficacy[efficacy.length - 1] : null;
  const plotNum = trial.RandomizationOrder || trial.PlotNumber || '?';

  return (
    <div className={`w-40 flex-shrink-0 border-2 rounded-lg p-3 shadow-sm hover:shadow-md transition relative overflow-hidden ${bg}`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${ribbon}`} />
      <div className="flex justify-between items-start mb-1">
        <span className="text-[9px] font-bold text-slate-400">PLOT {plotNum}</span>
        {badge}
      </div>
      <p className="font-bold text-xs text-slate-800 truncate mb-0.5" title={trial.FormulationName}>{trial.FormulationName || '—'}</p>
      <p className="text-[9px] text-slate-500 truncate">{trial.Dosage || '—'}</p>
      {latest?.weedCover !== undefined && (
        <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 border border-green-200 rounded text-[8px]">
          <span className="font-bold text-green-700">{latest.weedCover}% cover</span>
        </div>
      )}
      <div className="mt-1.5 flex justify-end">
        <span className={`text-[9px] font-bold ${isCompleted ? 'text-emerald-600' : 'text-amber-500'}`}>
          {isCompleted ? 'DONE' : 'ACTIVE'}
        </span>
      </div>
    </div>
  );
}

// ── Block card ─────────────────────────────────────────────────────────────
function BlockCard({ block, trials }) {
  const controls = trials.filter(t => String(t.IsControl).toLowerCase() === 'true');
  const hasControl = controls.length > 0;
  const tooMany = controls.length > 1;
  const icon = tooMany
    ? <AlertCircle className="w-4 h-4 text-red-500 animate-pulse" title="Multiple controls!" />
    : hasControl
      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" title="Control present" />
      : <AlertTriangle className="w-4 h-4 text-amber-500" title="Missing control!" />;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 flex justify-between items-center border-b">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 text-white w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs">
            R{block.ReplicationNum || '?'}
          </div>
          <span className="font-bold text-slate-800 text-sm">{block.Name}</span>
          {icon}
        </div>
        <span className="text-xs text-slate-400">{trials.length} plot{trials.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="p-3 overflow-x-auto">
        {trials.length > 0 ? (
          <div className="flex gap-3 min-w-max pb-1">
            {[...trials].sort((a, b) => (parseInt(a.RandomizationOrder) || 999) - (parseInt(b.RandomizationOrder) || 999))
              .map(t => <PlotMiniCard key={t.ID} trial={t} />)}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic py-3">No plots in this block.</p>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Projects({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();

  // list view state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ Name: '', Metric: 'Weed Control Efficiency', TargetWeed: '', Crop: '', Location: '', Investigator: '', StartDate: '' });

  // dashboard state
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [postHocMethod, setPostHocMethod] = useState('lsd');
  const [narrative, setNarrative] = useState('');
  const [isSavingNarrative, setIsSavingNarrative] = useState(false);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [blockForm, setBlockForm] = useState({ Name: '', ReplicationNum: '' });
  const [showMap, setShowMap] = useState(false);

  const projects = state.projects || [];
  const activeProject = activeProjectId ? projects.find(p => p.ID === activeProjectId) : null;

  // ── Open project dashboard ──────────────────────────────────────────────
  const openProject = (id) => {
    setActiveProjectId(id);
    setAnalysisResults(null);
    setPostHocMethod('lsd');
    const p = projects.find(x => x.ID === id);
    setNarrative(p?.Narrative || '');
  };

  // ── Run analysis ────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async (method = postHocMethod) => {
    if (!activeProjectId) return;
    setIsAnalyzing(true);
    try {
      const engine = new AnalysisEngine(activeProjectId, state);
      // Detect primary metric: prefer yield if any trial has yield data, otherwise use cover
      const hasYield = (state.trials || []).filter(t => t.ProjectID === activeProjectId).some(t => parseFloat(t.Yield || t.YieldValue) > 0);
      const primaryMetric = hasYield ? 'yield' : 'cover';
      const results = await engine.analyze(primaryMetric, null, null, { postHoc: method, persist: true });
      setAnalysisResults(results);
    } catch (e) {
      toast('Analysis failed: ' + e.message, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [activeProjectId, state, postHocMethod]);

  // Auto-run analysis when project opens
  useEffect(() => {
    if (activeProjectId) runAnalysis(postHocMethod);
  }, [activeProjectId]); // eslint-disable-line

  // Re-run when post-hoc method changes
  const handlePostHocChange = (method) => {
    setPostHocMethod(method);
    runAnalysis(method);
  };

  // ── Design completeness ─────────────────────────────────────────────────
  const designCheck = useMemo(() => {
    if (!activeProject) return null;
    const blocks = (state.blocks || []).filter(b => b.ProjectID === activeProject.ID);
    const trials = (state.trials || []).filter(t => t.ProjectID === activeProject.ID);
    const treatmentKeys = [...new Set(trials.map(t => t.FormulationName || t.FormulationID || 'Unknown'))];
    const expectedCells = blocks.length * treatmentKeys.length;

    const blockTrtCounts = {};
    blocks.forEach(b => { blockTrtCounts[b.ID] = {}; });
    const duplicates = [];
    trials.forEach(t => {
      if (!t.BlockID) return;
      const key = t.FormulationName || t.FormulationID || 'Unknown';
      if (!blockTrtCounts[t.BlockID]) blockTrtCounts[t.BlockID] = {};
      blockTrtCounts[t.BlockID][key] = (blockTrtCounts[t.BlockID][key] || 0) + 1;
      if (blockTrtCounts[t.BlockID][key] > 1) duplicates.push({ blockId: t.BlockID, key });
    });

    const missing = [];
    let observed = 0;
    blocks.forEach(b => {
      treatmentKeys.forEach(k => {
        const count = blockTrtCounts[b.ID]?.[k] || 0;
        if (count > 0) observed++;
        else missing.push({ blockName: b.Name || b.ID, key });
      });
    });
    const coveragePct = expectedCells > 0 ? Math.round((observed / expectedCells) * 100) : 0;
    const isBalanced = missing.length === 0 && duplicates.length === 0;

    // control integrity
    const blockControlChecks = blocks.map(b => {
      const bt = trials.filter(t => t.BlockID === b.ID);
      const count = bt.filter(t => String(t.IsControl).toLowerCase() === 'true').length;
      return { blockName: b.Name || b.ID, count };
    });
    const noControl = blockControlChecks.filter(x => x.count === 0);
    const multiControl = blockControlChecks.filter(x => x.count > 1);

    return { blocks, trials, treatmentKeys, expectedCells, observed, coveragePct, isBalanced, missing, duplicates, noControl, multiControl };
  }, [activeProject, state.blocks, state.trials]);

  // ── Per-treatment WCE over time ─────────────────────────────────────────
  const wceTimelineData = useMemo(() => {
    if (!activeProject) return { daas: [], series: [] };
    const trials = (state.trials || []).filter(t => t.ProjectID === activeProject.ID);
    const daaSet = new Set();
    trials.forEach(t => safeJsonParse(t.EfficacyDataJSON, []).forEach(e => { if (e.daa > 0) daaSet.add(e.daa); }));
    const daas = [...daaSet].sort((a, b) => a - b);
    const treatmentNames = [...new Set(trials.map(t => t.FormulationName).filter(Boolean))];

    // Find UTC for WCE calc
    const utcName = treatmentNames.find(n => /control|untreated|check/i.test(n));

    const series = treatmentNames.map(name => {
      const trtTrials = trials.filter(t => t.FormulationName === name);
      const values = daas.map(daa => {
        const covers = trtTrials.map(t => {
          const eff = safeJsonParse(t.EfficacyDataJSON, []);
          const obs = eff.find(e => e.daa === daa);
          return obs ? parseFloat(obs.weedCover ?? 0) : null;
        }).filter(v => v !== null);
        if (covers.length === 0) return null;
        const meanCover = covers.reduce((s, v) => s + v, 0) / covers.length;

        if (utcName && utcName !== name) {
          const utcTrials = trials.filter(t => t.FormulationName === utcName);
          const utcCovers = utcTrials.map(t => {
            const eff = safeJsonParse(t.EfficacyDataJSON, []);
            const obs = eff.find(e => e.daa === daa);
            return obs ? parseFloat(obs.weedCover ?? 0) : null;
          }).filter(v => v !== null);
          if (utcCovers.length > 0) {
            const utcMean = utcCovers.reduce((s, v) => s + v, 0) / utcCovers.length;
            return utcMean > 0 ? parseFloat(((1 - meanCover / utcMean) * 100).toFixed(1)) : 0;
          }
        }
        return parseFloat(meanCover.toFixed(1));
      });
      return { name, values };
    });
    return { daas: daas.map(d => `DAA ${d}`), series };
  }, [activeProject, state.trials]);

  // ── Treatment performance chart data ───────────────────────────────────
  const perfChartData = useMemo(() => {
    if (!analysisResults?.means) return [];
    return Object.entries(analysisResults.means)
      .map(([name, mean]) => ({ label: name.length > 12 ? name.slice(0, 10) + '…' : name, value: isFinite(mean) ? mean : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [analysisResults]);

  // ── Per-treatment stats (Mean, SD, CV, WCE) ────────────────────────────
  const treatmentStats = useMemo(() => {
    if (!activeProject || !analysisResults?.means) return [];
    const trials = (state.trials || []).filter(t => t.ProjectID === activeProject.ID);
    const utcName = Object.keys(analysisResults.means).find(n => /control|untreated|check/i.test(n));
    const utcMean = utcName ? (analysisResults.means[utcName] ?? 0) : 0;

    return (analysisResults.grouping || []).map(g => {
      const trtTrials = trials.filter(t => t.FormulationName === g.name);
      const repValues = trtTrials.map(t => {
        const eff = safeJsonParse(t.EfficacyDataJSON, []);
        if (!eff.length) return null;
        const last = eff.sort((a, b) => b.daa - a.daa)[0];
        return last ? parseFloat(last.weedCover ?? 0) : null;
      }).filter(v => v !== null);

      const n = repValues.length;
      const mean = n > 0 ? repValues.reduce((s, v) => s + v, 0) / n : 0;
      const variance = n > 1 ? repValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1) : 0;
      const sd = Math.sqrt(variance);
      const cv = mean > 0 ? (sd / mean) * 100 : 0;
      const wce = utcMean > 0 ? Math.max(0, (1 - mean / utcMean) * 100) : 0;
      return { name: g.name, n, mean, sd, cv, wce, grouping: g.grouping, repValues };
    });
  }, [activeProject, analysisResults, state.trials]);

  // ── Significance formatter ─────────────────────────────────────────────
  const sigStars = (p) => {
    if (!isFinite(p)) return 'N/A';
    if (p < 0.001) return '*** (p<0.001)';
    if (p < 0.01)  return '**  (p<0.01)';
    if (p < 0.05)  return '*   (p<0.05)';
    return 'ns  (p≥0.05)';
  };

  // ── Add block ───────────────────────────────────────────────────────────
  const handleAddBlock = async (e) => {
    e.preventDefault();
    if (!activeProjectId || !blockForm.Name.trim()) return;
    const payload = {
      ID: Date.now().toString(),
      ProjectID: activeProjectId,
      Name: blockForm.Name.trim(),
      ReplicationNum: blockForm.ReplicationNum || String((state.blocks || []).filter(b => b.ProjectID === activeProjectId).length + 1),
      CreatedAt: new Date().toISOString(),
    };
    updateState({ blocks: [...(state.blocks || []), payload] });
    setBlockForm({ Name: '', ReplicationNum: '' });
    setIsAddingBlock(false);
    try {
      await addBlock(payload, getAppState);
      toast('Block added');
    } catch { toast('Failed to save block', 'error'); }
  };

  // ── Lock / Unlock ───────────────────────────────────────────────────────
  const handleLockToggle = async () => {
    if (!activeProject) return;
    const newStatus = activeProject.Status === 'Locked' ? 'Draft' : 'Locked';
    const updated = projects.map(p => p.ID === activeProject.ID ? { ...p, Status: newStatus } : p);
    updateState({ projects: updated });
    try {
      await updateProject({ ID: activeProject.ID, Status: newStatus }, getAppState);
      toast(`Project ${newStatus === 'Locked' ? 'locked' : 'unlocked'}`);
    } catch { toast('Failed to update project', 'error'); }
  };

  // ── Save narrative ──────────────────────────────────────────────────────
  const handleSaveNarrative = async () => {
    if (!narrative.trim()) { toast('Narrative is empty', 'error'); return; }
    setIsSavingNarrative(true);
    try {
      await updateProject({ ID: activeProjectId, Narrative: narrative }, getAppState);
      const updated = projects.map(p => p.ID === activeProjectId ? { ...p, Narrative: narrative } : p);
      updateState({ projects: updated });
      toast('Narrative saved');
    } catch { toast('Failed to save narrative', 'error'); }
    finally { setIsSavingNarrative(false); }
  };

  // ── Generate AI narrative ───────────────────────────────────────────────
  const handleGenerateNarrative = async () => {
    if (!analysisResults) { toast('Run analysis first', 'error'); return; }
    setIsGeneratingNarrative(true);
    try {
      const geminiKey = state.settings?.geminiApiKeys?.[0] || state.settings?.geminiApiKey || '';
      if (!geminiKey) throw new Error('No Gemini API key configured in Settings');
      const groupingText = (analysisResults.grouping || [])
        .map(g => `- ${g.name}: mean=${isFinite(g.mean) ? g.mean.toFixed(2) : 'N/A'} (Group ${g.grouping})`)
        .join('\n');
      const prompt = `Act as an Agronomist. Analyze trial data for '${activeProject?.Name}'.
Metric: ${activeProject?.Metric}
Treatments & Means:
${groupingText}
Post-hoc: ${postHocMethod === 'tukey' ? 'Tukey HSD' : "Fisher's LSD"} (alpha=0.05)
ANOVA P-Value: ${isFinite(analysisResults.anova?.pVal) ? analysisResults.anova.pVal.toFixed(5) : 'N/A'}
Write a 3-paragraph Narrative covering Methodology, Results and Conclusions.`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) throw new Error('No response from AI');
      setNarrative(text);
    } catch (e) {
      toast('AI error: ' + e.message, 'error');
    } finally {
      setIsGeneratingNarrative(false);
    }
  };

  // ── Recalculate DAA for project trials ──────────────────────────────────
  const handleRecalcDAA = async () => {
    if (!activeProject) return;
    const pTrials = (state.trials || []).filter(t => t.ProjectID === activeProject.ID);
    let updated = 0;
    const newTrials = (state.trials || []).map(t => {
      if (t.ProjectID !== activeProject.ID || !t.Date) return t;
      const appDate = new Date(t.Date);
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      const recalculated = eff.map(obs => {
        if (!obs.date) return obs;
        const obsDate = new Date(obs.date);
        const daa = Math.round((obsDate - appDate) / (1000 * 60 * 60 * 24));
        return { ...obs, daa: Math.max(0, daa) };
      });
      const changed = JSON.stringify(recalculated) !== JSON.stringify(eff);
      if (changed) updated++;
      return { ...t, EfficacyDataJSON: JSON.stringify(recalculated) };
    });
    updateState({ trials: newTrials });
    toast(`Recalculated DAA for ${updated} trial(s)`, updated > 0 ? 'success' : 'info');
    if (updated > 0) runAnalysis(postHocMethod);
  };

  // ── Randomize Layout ────────────────────────────────────────────────────
  const [isRandomizeModalOpen, setIsRandomizeModalOpen] = useState(false);
  const [randomizeBlockId, setRandomizeBlockId] = useState('');

  const handleRandomizeLayout = () => {
    if (!activeProject) return;
    const pBlocks = (state.blocks || []).filter(b => b.ProjectID === activeProject.ID);
    if (pBlocks.length === 0) { toast('No blocks to randomize', 'error'); return; }
    setRandomizeBlockId(pBlocks[0]?.ID || '');
    setIsRandomizeModalOpen(true);
  };

  const applyRandomization = () => {
    if (!randomizeBlockId) { toast('Select a block', 'error'); return; }
    const blockTrials = (state.trials || []).filter(t => t.BlockID === randomizeBlockId);
    if (blockTrials.length === 0) { toast('No trials in this block', 'error'); return; }
    // Fisher-Yates shuffle for plot orders
    const shuffled = [...blockTrials].sort(() => Math.random() - 0.5);
    const updates = shuffled.map((t, i) => ({ ...t, RandomizationOrder: i + 1 }));
    const newTrials = (state.trials || []).map(t => {
      const upd = updates.find(u => u.ID === t.ID);
      return upd || t;
    });
    updateState({ trials: newTrials });
    toast(`Randomized ${updates.length} plots in block`, 'success');
    setIsRandomizeModalOpen(false);
  };

  // ── Protocol Settings ───────────────────────────────────────────────────
  const [isProtocolModalOpen, setIsProtocolModalOpen] = useState(false);
  const [protocolForm, setProtocolForm] = useState({ TargetWeed: '', Crop: '', Metric: 'Weed Control Efficiency', ApplicationTiming: '', SprayVolume: '', Notes: '' });

  const openProtocolSettings = () => {
    if (!activeProject) return;
    setProtocolForm({
      TargetWeed: activeProject.TargetWeed || '',
      Crop: activeProject.Crop || '',
      Metric: activeProject.Metric || 'Weed Control Efficiency',
      ApplicationTiming: activeProject.ApplicationTiming || '',
      SprayVolume: activeProject.SprayVolume || '',
      Notes: activeProject.Notes || ''
    });
    setIsProtocolModalOpen(true);
  };

  const saveProtocolSettings = async () => {
    if (!activeProject) return;
    const updated = projects.map(p => p.ID === activeProject.ID ? { ...p, ...protocolForm } : p);
    updateState({ projects: updated });
    try {
      await updateProject({ ID: activeProject.ID, ...protocolForm }, getAppState);
      toast('Protocol settings saved');
      setIsProtocolModalOpen(false);
    } catch { toast('Failed to save', 'error'); }
  };

  // ── Scientific Report ─────────────────────────────────────────────────────
  const handleScientificReport = () => {
    if (!activeProject || !analysisResults) { toast('Run analysis first', 'error'); return; }
    const pTrials = (state.trials || []).filter(t => t.ProjectID === activeProject.ID);
    const pBlocks = (state.blocks || []).filter(b => b.ProjectID === activeProject.ID);
    const treatmentRows = (analysisResults.grouping || []).map(g => {
      const ts = treatmentStats.find(x => x.name === g.name);
      return `<tr><td style="padding:8px 10px;border:1px solid #e2e8f0">${g.name}</td><td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">${isFinite(g.mean) ? g.mean.toFixed(2) : '-'}</td><td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">${ts ? ts.sd.toFixed(2) : '-'}</td><td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">${ts ? ts.cv.toFixed(1) : '-'}%</td><td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">${ts ? ts.wce.toFixed(1) : '-'}%</td><td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;font-weight:bold;color:#047857;background:#f0fdf4;border-radius:4px">${g.grouping}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><title>Scientific Report - ${activeProject.Name}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;margin:40px;color:#1e293b;line-height:1.6}h1{color:#065f46;font-size:28px;border-bottom:3px solid #10b981;padding-bottom:12px}h2{color:#334155;font-size:16px;text-transform:uppercase;letter-spacing:1px;margin-top:30px;border-left:4px solid #10b981;padding-left:12px}table{border-collapse:collapse;width:100%;margin:12px 0}th{background:#f1f5f9;padding:10px;border:1px solid #e2e8f0;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b}td{padding:8px 10px;border:1px solid #e2e8f0;font-size:13px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px;color:#475569;margin:20px 0;padding:16px;background:#f8fafc;border-radius:8px}.meta span{font-weight:600;color:#1e293b}.sig{background:#dcfce7;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#166534}.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.stat-box{background:#f8fafc;padding:12px;border-radius:8px;text-align:center;border:1px solid #e2e8f0}.stat-label{font-size:11px;color:#64748b;text-transform:uppercase}.stat-value{font-size:20px;font-weight:700;color:#1e293b}</style></head>
<body><h1>Scientific RCBD Report: ${activeProject.Name}</h1>
<div class="meta">
<div>Project ID: <span>${activeProject.ID}</span></div><div>Status: <span>${activeProject.Status || 'Draft'}</span></div>
<div>Location: <span>${activeProject.Location || 'N/A'}</span></div><div>Investigator: <span>${activeProject.Investigator || 'N/A'}</span></div>
<div>Crop: <span>${activeProject.Crop || 'N/A'}</span></div><div>Target Weed: <span>${activeProject.TargetWeed || 'N/A'}</span></div>
<div>Metric: <span>${activeProject.Metric}</span></div><div>Generated: <span>${formatDateTime(new Date())}</span></div>
<div>Blocks: <span>${pBlocks.length}</span></div><div>Plots: <span>${pTrials.length}</span></div>
</div>
<h2>Summary Statistics</h2>
<div class="stat-grid">
<div class="stat-box"><div class="stat-label">CV%</div><div class="stat-value">${isFinite(analysisResults.anova?.cv) ? analysisResults.anova.cv.toFixed(1) : '-'}%</div></div>
<div class="stat-box"><div class="stat-label">LSD (0.05)</div><div class="stat-value">${isFinite(analysisResults.postHoc?.value) ? analysisResults.postHoc.value.toFixed(2) : '-'}</div></div>
<div class="stat-box"><div class="stat-label">F-Ratio</div><div class="stat-value">${isFinite(analysisResults.anova?.fVal) ? analysisResults.anova.fVal.toFixed(2) : '-'}</div></div>
<div class="stat-box"><div class="stat-label">P-Value</div><div class="stat-value">${isFinite(analysisResults.anova?.pVal) ? analysisResults.anova.pVal.toFixed(4) : '-'}</div></div>
</div>
<h2>Treatment Means & Statistical Grouping</h2>
<table><thead><tr><th>Treatment</th><th style="text-align:center">Mean</th><th style="text-align:center">SD</th><th style="text-align:center">CV%</th><th style="text-align:center">WCE%</th><th style="text-align:center">Group (${postHocMethod === 'tukey' ? 'Tukey' : 'LSD'})</th></tr></thead><tbody>${treatmentRows}</tbody></table>
<p style="font-size:12px;color:#64748b;margin-top:8px">Means sharing the same letter are not significantly different (${postHocMethod === 'tukey' ? 'Tukey HSD' : "Fisher's LSD"}, α=0.05). Design: ${analysisResults.balance?.isBalanced ? 'Balanced RCBD' : 'Unbalanced RCBD (robust)'}</p>
<h2>ANOVA Results</h2>
<table><thead><tr><th>Source</th><th style="text-align:center">DF</th><th style="text-align:center">SS</th><th style="text-align:center">MS</th><th style="text-align:center">F</th><th style="text-align:center">P</th><th style="text-align:center">Sig</th></tr></thead>
<tbody>
<tr><td>Treatment</td><td style="text-align:center">${analysisResults.anova?.dfTreat ?? '-'}</td><td style="text-align:center">${isFinite(analysisResults.anova?.ssTreat) ? analysisResults.anova.ssTreat.toFixed(2) : '-'}</td><td style="text-align:center">${isFinite(analysisResults.anova?.msTreat) ? analysisResults.anova.msTreat.toFixed(2) : '-'}</td><td style="text-align:center;font-weight:bold">${isFinite(analysisResults.anova?.fVal) ? analysisResults.anova.fVal.toFixed(2) : '-'}</td><td style="text-align:center">${isFinite(analysisResults.anova?.pVal) ? analysisResults.anova.pVal.toFixed(4) : '-'}</td><td style="text-align:center"><span class="sig">${sigStars(analysisResults.anova?.pVal)}</span></td></tr>
<tr><td>Block</td><td style="text-align:center">${analysisResults.anova?.dfBlock ?? '-'}</td><td style="text-align:center">${isFinite(analysisResults.anova?.ssBlock) ? analysisResults.anova.ssBlock.toFixed(2) : '-'}</td><td style="text-align:center">${isFinite(analysisResults.anova?.msBlock) ? analysisResults.anova.msBlock.toFixed(2) : '-'}</td><td colspan="3"></td></tr>
<tr><td>Error</td><td style="text-align:center">${analysisResults.anova?.dfError ?? '-'}</td><td style="text-align:center">${isFinite(analysisResults.anova?.ssError) ? analysisResults.anova.ssError.toFixed(2) : '-'}</td><td style="text-align:center">${isFinite(analysisResults.anova?.msError) ? analysisResults.anova.msError.toFixed(2) : '-'}</td><td colspan="3"></td></tr>
<tr style="background:#f8fafc;font-weight:600"><td>Total</td><td style="text-align:center">${analysisResults.anova?.dfTotal ?? '-'}</td><td style="text-align:center">${isFinite(analysisResults.anova?.ssTotal) ? analysisResults.anova.ssTotal.toFixed(2) : '-'}</td><td colspan="4"></td></tr>
</tbody></table>
<h2>Agronomist Narrative</h2>
<div style="background:#f8fafc;padding:16px;border-radius:8px;border-left:4px solid #6366f1"><p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap">${narrative || 'No narrative generated yet.'}</p></div>
</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    toast('Scientific report opened');
  };

  // ── Regulatory DOCX Export ────────────────────────────────────────────────
  const handleRegulatoryDOCX = () => {
    if (!activeProject || !analysisResults) { toast('Run analysis first', 'error'); return; }
    // Generate a simple HTML-based DOCX-compatible document
    const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Regulatory Report</title></head><body>`;
    const footer = `</body></html>`;
    const content = `<h1>RCBD Regulatory Report: ${activeProject.Name}</h1>
<p><strong>Project:</strong> ${activeProject.Name}<br>
<strong>Location:</strong> ${activeProject.Location || 'N/A'}<br>
<strong>Investigator:</strong> ${activeProject.Investigator || 'N/A'}<br>
<strong>Crop:</strong> ${activeProject.Crop || 'N/A'}<br>
<strong>Metric:</strong> ${activeProject.Metric}<br>
<strong>Generated:</strong> ${formatDateTime(new Date())}</p>
<h2>Treatment Means & Grouping (${postHocMethod === 'tukey' ? 'Tukey HSD' : "Fisher's LSD"})</h2>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Treatment</th><th>Mean</th><th>SD</th><th>CV%</th><th>WCE%</th><th>Group</th></tr>
${(analysisResults.grouping || []).map(g => {
      const ts = treatmentStats.find(x => x.name === g.name);
      return `<tr><td>${g.name}</td><td>${isFinite(g.mean) ? g.mean.toFixed(2) : '-'}</td><td>${ts ? ts.sd.toFixed(2) : '-'}</td><td>${ts ? ts.cv.toFixed(1) : '-'}%</td><td>${ts ? ts.wce.toFixed(1) : '-'}%</td><td><strong>${g.grouping}</strong></td></tr>`;
    }).join('')}
</table>
<p>Means sharing the same letter are not significantly different (α=0.05).</p>
<h2>ANOVA Summary</h2>
<p>F-Ratio: ${isFinite(analysisResults.anova?.fVal) ? analysisResults.anova.fVal.toFixed(2) : '-'}<br>
P-Value: ${isFinite(analysisResults.anova?.pVal) ? analysisResults.anova.pVal.toFixed(4) : '-'}<br>
CV: ${isFinite(analysisResults.anova?.cv) ? analysisResults.anova.cv.toFixed(1) : '-'}%<br>
LSD/HSD (0.05): ${isFinite(analysisResults.postHoc?.value) ? analysisResults.postHoc.value.toFixed(2) : '-'}</p>
<p><em>Generated by HerbiRice RCBD Analysis System</em></p>`;
    const blob = new Blob([header + content + footer], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeProject.Name.replace(/[^a-z0-9]/gi, '_')}_RegulatoryReport.doc`;
    a.click();
    toast('DOCX report downloaded');
  };

  // ── Regulatory PDF ────────────────────────────────────────────────────
  const handleRegulatoryPDF = () => {
    if (!activeProject || !analysisResults) { toast('Run analysis first', 'error'); return; }
    const pTrials = (state.trials || []).filter(t => t.ProjectID === activeProject.ID);
    const pBlocks = (state.blocks || []).filter(b => b.ProjectID === activeProject.ID);
    const cv = isFinite(analysisResults.anova?.cv) ? analysisResults.anova.cv.toFixed(1) : 'N/A';
    const rows = (analysisResults.grouping || []).map(g => {
      const ts = treatmentStats.find(x => x.name === g.name);
      return `<tr><td style="padding:6px 10px;border:1px solid #ddd">${g.name}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${isFinite(g.mean) ? g.mean.toFixed(2) : '-'}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${ts ? ts.sd.toFixed(2) : '-'}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${ts ? ts.cv.toFixed(1) : '-'}%</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${ts ? ts.wce.toFixed(1) : '-'}%</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;font-weight:bold;color:#059669">${g.grouping}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><title>Regulatory Report - ${activeProject.Name}</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#1e293b}h1{color:#065f46}h2{color:#334155;margin-top:24px;font-size:14px;text-transform:uppercase;letter-spacing:1px}table{border-collapse:collapse;width:100%}th{background:#f1f5f9;padding:8px 10px;border:1px solid #ddd;text-align:left;font-size:11px;text-transform:uppercase}td{font-size:12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:12px;color:#475569}.meta span{font-weight:600;color:#1e293b}.sig{background:#dcfce7;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;color:#166534}</style></head>
<body><h1>RCBD Trial Report: ${activeProject.Name}</h1>
<div class="meta"><div>Location: <span>${activeProject.Location || 'N/A'}</span></div><div>Investigator: <span>${activeProject.Investigator || 'N/A'}</span></div>
<div>Crop: <span>${activeProject.Crop || 'N/A'}</span></div><div>Metric: <span>${activeProject.Metric}</span></div>
<div>Blocks: <span>${pBlocks.length}</span></div><div>Plots: <span>${pTrials.length}</span></div>
<div>Start Date: <span>${formatDateTime(activeProject.StartDate) || 'N/A'}</span></div><div>Generated: <span>${formatDateTime(new Date())}</span></div></div>
<h2>Treatment Means & Statistical Grouping</h2>
<table><thead><tr><th>Treatment</th><th>Mean</th><th>SD</th><th>CV%</th><th>WCE%</th><th>Group (${postHocMethod === 'tukey' ? 'Tukey' : 'LSD'})</th></tr></thead><tbody>${rows}</tbody></table>
<p style="font-size:11px;color:#64748b;margin-top:6px">Means sharing the same letter are not significantly different (${postHocMethod === 'tukey' ? 'Tukey HSD' : "Fisher's LSD"}, α=0.05). ${postHocMethod === 'tukey' ? 'HSD' : 'LSD'} (0.05): ${isFinite(analysisResults.postHoc?.value) ? analysisResults.postHoc.value.toFixed(2) : 'N/A'}</p>
<h2>ANOVA Table</h2>
<table><thead><tr><th>Source</th><th>DF</th><th>SS</th><th>MS</th><th>F</th><th>P</th><th>Sig</th></tr></thead><tbody>
<tr><td style="padding:6px 10px;border:1px solid #ddd">Treatment</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${analysisResults.anova?.dfTreat ?? '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.ssTreat) ? analysisResults.anova.ssTreat.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.msTreat) ? analysisResults.anova.msTreat.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right;font-weight:bold">${isFinite(analysisResults.anova?.fVal) ? analysisResults.anova.fVal.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.pVal) ? analysisResults.anova.pVal.toFixed(4) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:center" class="sig">${sigStars(analysisResults.anova?.pVal)}</td></tr>
<tr><td style="padding:6px 10px;border:1px solid #ddd">Block</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${analysisResults.anova?.dfBlock ?? '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.ssBlock) ? analysisResults.anova.ssBlock.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.msBlock) ? analysisResults.anova.msBlock.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd"></td><td style="padding:6px 10px;border:1px solid #ddd"></td><td style="padding:6px 10px;border:1px solid #ddd"></td></tr>
<tr><td style="padding:6px 10px;border:1px solid #ddd">Error</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${analysisResults.anova?.dfError ?? '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.ssError) ? analysisResults.anova.ssError.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.msError) ? analysisResults.anova.msError.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd"></td><td style="padding:6px 10px;border:1px solid #ddd"></td><td style="padding:6px 10px;border:1px solid #ddd"></td></tr>
<tr style="font-weight:bold;background:#f8fafc"><td style="padding:6px 10px;border:1px solid #ddd">Total</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${analysisResults.anova?.dfTotal ?? '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.ssTotal) ? analysisResults.anova.ssTotal.toFixed(2) : '-'}</td><td colspan="4" style="padding:6px 10px;border:1px solid #ddd"></td></tr>
</tbody></table>
<p style="font-size:11px;color:#64748b;margin-top:6px">CV: ${cv}% · Design: ${analysisResults.balance?.isBalanced ? 'Balanced RCBD' : 'Unbalanced RCBD'}</p>
${narrative ? `<h2>Agronomist Narrative</h2><p style="font-size:13px;line-height:1.6;white-space:pre-wrap">${narrative}</p>` : ''}
</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
    toast('Regulatory report opened for printing');
  };

  // ── Export helpers ──────────────────────────────────────────────────────
  const exportCSV = (filename, rows, headers) => {
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = filename; a.click();
  };

  const handleExportR = () => {
    if (!activeProject) return;
    const trials = (state.trials || []).filter(t => t.ProjectID === activeProject.ID);
    exportCSV(`${activeProject.Name}_R.csv`, trials.map(t => ({
      Treatment: t.FormulationName, Block: t.BlockID, WCE: t.WCE || '', Result: t.Result || ''
    })), ['Treatment', 'Block', 'WCE', 'Result']);
    toast('Exported for R');
  };

  const handleExportSAS = () => {
    if (!activeProject) return;
    const trials = (state.trials || []).filter(t => t.ProjectID === activeProject.ID);
    const lines = ['data rcbd;', 'input trt $ block wce;', 'datalines;',
      ...trials.map(t => `${(t.FormulationName || 'T').replace(/\s/g, '_')} ${t.BlockID || 1} ${t.WCE || 0}`),
      ';', 'run;', '', 'proc glm data=rcbd;', '  class trt block;', '  model wce=block trt;', '  lsmeans trt / pdiff adjust=tukey;', 'run;'
    ];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    a.download = `${activeProject.Name}_SAS.sas`; a.click();
    toast('Exported for SAS');
  };

  const handleExportBundle = () => {
    if (!activeProject || !analysisResults) { toast('Run analysis first', 'error'); return; }
    const json = JSON.stringify({ project: activeProject, analysis: analysisResults }, null, 2);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `${activeProject.Name}_analysis_bundle.json`; a.click();
    toast('Analysis bundle exported');
  };

  // ── Create project ──────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      ID: Date.now().toString(),
      Status: 'Draft',
      CreatedAt: new Date().toISOString(),
      BlocksJSON: '[]',
      AnalysisResultsJSON: '{}',
      Narrative: '',
      CreatedBy: state.auth?.user?.id || 'system',
    };
    updateState({ projects: [...projects, payload] });
    setIsModalOpen(false);
    try {
      await addProject(payload, getAppState);
      toast('Project created');
    } catch { toast('Failed to create project', 'error'); }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this project? Blocks and plots will be orphaned.')) return;
    updateState({ projects: projects.filter(p => p.ID !== id) });
    try {
      await deleteProject({ ID: id }, getAppState);
      toast('Project deleted');
    } catch { toast('Failed to delete project', 'error'); }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT DASHBOARD VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (activeProject) {
    const projectBlocks = (state.blocks || []).filter(b => b.ProjectID === activeProject.ID);
    const projectTrials = (state.trials || []).filter(t => t.ProjectID === activeProject.ID);
    const treatments = [...new Set(projectTrials.map(t => t.FormulationName).filter(Boolean))];
    const isLocked = activeProject.Status === 'Locked';

    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
        <TopBar title={activeProject.Name} onMenuClick={onMenuClick} />

        <div className="flex-1 overflow-y-auto">
          {/* ── Header ── */}
          <div className="bg-white border-b px-4 py-4">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setActiveProjectId(null)} className="p-2 rounded-lg border hover:bg-slate-50 transition shrink-0">
                  <ArrowLeft className="w-4 h-4 text-slate-600" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-800 truncate">{activeProject.Name}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${isLocked ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-700'}`}>
                      {activeProject.Status || 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Metric: {activeProject.Metric} · {projectBlocks.length} blocks · {projectTrials.length} plots · {treatments.length} treatments</p>
                </div>
                <button
                  onClick={() => setShowMap(true)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition shrink-0"
                >
                  <MapPin className="w-4 h-4" />
                  Map
                </button>
                <button
                  onClick={() => runAnalysis(postHocMethod)}
                  disabled={isAnalyzing}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold transition shrink-0"
                >
                  {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
                  {isAnalyzing ? 'Analyzing…' : 'Run Analysis'}
                </button>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto p-4 space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">

              {/* ── LEFT: main content ── */}
              <div className="xl:col-span-3 space-y-5">

                {/* ── Design Completeness + Control Integrity ── */}
                {designCheck && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Design Completeness */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                            <LayoutGrid className="w-4 h-4 text-emerald-600" /> Design Completeness
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">Every block has every treatment (RCBD).</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${designCheck.isBalanced ? 'bg-emerald-100 text-emerald-700' : designCheck.missing.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          {designCheck.isBalanced ? 'Balanced' : designCheck.missing.length > 0 ? 'Incomplete' : 'Check'}
                        </span>
                      </div>
                      <MiniBar value={designCheck.coveragePct} max={100} color={designCheck.isBalanced ? 'bg-emerald-500' : 'bg-amber-500'} />
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        {[['Coverage', `${designCheck.coveragePct}%`], ['Expected cells', designCheck.expectedCells],
                          ['Missing cells', designCheck.missing.length], ['Duplicates', designCheck.duplicates.length]
                        ].map(([label, val]) => (
                          <div key={label} className="flex justify-between">
                            <span className="text-slate-500">{label}</span>
                            <span className={`font-bold ${(label === 'Missing cells' || label === 'Duplicates') && Number(val) > 0 ? 'text-amber-700' : 'text-slate-700'}`}>{val}</span>
                          </div>
                        ))}
                      </div>
                      {designCheck.missing.length > 0 && (
                        <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-2 text-xs text-amber-800">
                          <div className="font-bold flex items-center gap-1 mb-1"><AlertTriangle className="w-3 h-3" /> Missing cells:</div>
                          {designCheck.missing.slice(0, 4).map((m, i) => (
                            <div key={i} className="flex justify-between"><span>{m.blockName}</span><span className="font-semibold truncate ml-2">{m.key}</span></div>
                          ))}
                          {designCheck.missing.length > 4 && <div className="text-amber-600 mt-1">+{designCheck.missing.length - 4} more</div>}
                        </div>
                      )}
                      {designCheck.isBalanced && (
                        <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-xs text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> All blocks contain all treatments.
                        </div>
                      )}
                    </div>

                    {/* Control Integrity */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                            <ShieldAlert className="w-4 h-4 text-emerald-600" /> Control Integrity
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">Checks untreated control count per block.</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${(designCheck.noControl.length === 0 && designCheck.multiControl.length === 0) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {(designCheck.noControl.length === 0 && designCheck.multiControl.length === 0) ? 'OK' : 'Attention'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="flex justify-between"><span className="text-slate-500">Blocks w/o control</span><span className={`font-bold ${designCheck.noControl.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{designCheck.noControl.length}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Blocks {'>'} 1 control</span><span className={`font-bold ${designCheck.multiControl.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{designCheck.multiControl.length}</span></div>
                      </div>
                      {(designCheck.noControl.length > 0 || designCheck.multiControl.length > 0) ? (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-xs text-amber-800 space-y-1">
                          {designCheck.noControl.length > 0 && <div><span className="font-bold">No control: </span>{designCheck.noControl.map(b => b.blockName).join(', ')}</div>}
                          {designCheck.multiControl.length > 0 && <div><span className="font-bold">Multiple controls: </span>{designCheck.multiControl.map(b => `${b.blockName}(${b.count})`).join(', ')}</div>}
                        </div>
                      ) : (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-xs text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Each block has exactly one control.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Blocks ── */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><Layers className="w-4 h-4 text-emerald-600" /> Blocks & Plots</h3>
                    {!isLocked && (
                      <button onClick={() => setIsAddingBlock(v => !v)} className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold transition">
                        <Plus className="w-3.5 h-3.5" /> Add Block
                      </button>
                    )}
                  </div>

                  {isAddingBlock && (
                    <form onSubmit={handleAddBlock} className="mb-4 flex flex-wrap gap-2 items-end bg-slate-50 p-3 rounded-lg border">
                      <div className="flex-1 min-w-36">
                        <label className="text-xs font-bold text-slate-500 block mb-1">Block Name</label>
                        <input required value={blockForm.Name} onChange={e => setBlockForm(v => ({ ...v, Name: e.target.value }))} className={INPUT} placeholder="e.g. Block 1 / Rep A" />
                      </div>
                      <div className="w-28">
                        <label className="text-xs font-bold text-slate-500 block mb-1">Rep #</label>
                        <input type="number" min="1" value={blockForm.ReplicationNum} onChange={e => setBlockForm(v => ({ ...v, ReplicationNum: e.target.value }))} className={INPUT} placeholder="1" />
                      </div>
                      <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold">Save</button>
                      <button type="button" onClick={() => setIsAddingBlock(false)} className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                    </form>
                  )}

                  {projectBlocks.length > 0 ? (
                    <div className="space-y-4">
                      {projectBlocks.map(b => (
                        <BlockCard key={b.ID} block={b} trials={projectTrials.filter(t => t.BlockID === b.ID)} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      No blocks yet. {!isLocked && <button onClick={() => setIsAddingBlock(true)} className="text-emerald-600 font-semibold hover:underline">Add the first block →</button>}
                    </div>
                  )}
                </div>

                {/* ── Analysis Results ── */}
                {analysisResults && (
                  <div className="space-y-4">
                    {/* Post-hoc selector + Treatment Means Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                        <div>
                          <h3 className="font-bold text-slate-800 text-sm">Treatment Means & Significance</h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {postHocMethod === 'tukey'
                              ? "Tukey HSD — conservative; recommended for many treatments."
                              : "Fisher's LSD — more powerful; use when ANOVA is significant."}
                          </p>
                        </div>
                        <div className="shrink-0">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Post-hoc test</label>
                          <select value={postHocMethod} onChange={e => handlePostHocChange(e.target.value)} className="text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                            <option value="lsd">Fisher's LSD</option>
                            <option value="tukey">Tukey HSD</option>
                          </select>
                        </div>
                      </div>
                      <div className="overflow-x-auto -mx-5 px-5">
                        <table className="w-full text-sm text-left min-w-[360px]">
                          <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                            <tr>
                              <th className="p-3">Treatment</th>
                              <th className="p-3 text-center">Mean</th>
                              <th className="p-3 text-center">Group ({postHocMethod === 'tukey' ? 'Tukey' : 'LSD'})</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(analysisResults.grouping || []).map((g, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-700">{g.name}</td>
                                <td className="p-3 text-center">{isFinite(g.mean) ? g.mean.toFixed(2) : '—'}</td>
                                <td className="p-3 text-center font-bold text-emerald-700">{g.grouping}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-3 text-xs text-slate-400">
                        Means sharing the same letter are not significantly different ({postHocMethod === 'tukey' ? 'Tukey HSD' : "Fisher's LSD"}, α=0.05).
                        {isFinite(analysisResults.postHoc?.value) && <span className="ml-2 font-semibold">{postHocMethod === 'tukey' ? 'HSD' : 'LSD'} (0.05): {analysisResults.postHoc.value.toFixed(2)}</span>}
                      </p>
                    </div>

                    {/* Per-treatment stats table */}
                    {treatmentStats.length > 0 && (
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                        <h3 className="font-bold text-slate-800 mb-1 text-sm flex items-center gap-2"><Sigma className="w-4 h-4 text-blue-500" /> Treatment Statistics (Final Observation)</h3>
                        <p className="text-xs text-slate-400 mb-3">Mean weed cover ± SD from last observation per replicate. WCE% vs untreated control.</p>
                        <div className="overflow-x-auto -mx-5 px-5">
                          <table className="w-full text-sm text-left min-w-[480px]">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                              <tr>
                                {['Treatment','n','Mean','±SD','CV%','WCE%',`Group (${postHocMethod === 'tukey' ? 'Tukey' : 'LSD'})`].map(h => (
                                  <th key={h} className="p-3 text-right first:text-left">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {treatmentStats.map((ts, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="p-3 font-medium text-slate-700 max-w-[140px] truncate" title={ts.name}>{ts.name}</td>
                                  <td className="p-3 text-right text-slate-500">{ts.n}</td>
                                  <td className="p-3 text-right font-semibold text-slate-800">{ts.mean.toFixed(2)}</td>
                                  <td className="p-3 text-right text-slate-500">{ts.sd.toFixed(2)}</td>
                                  <td className="p-3 text-right">
                                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${ts.cv < 15 ? 'bg-emerald-50 text-emerald-700' : ts.cv < 30 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                                      {ts.cv.toFixed(1)}%
                                    </span>
                                  </td>
                                  <td className={`p-3 text-right font-bold ${ts.wce >= 80 ? 'text-emerald-600' : ts.wce >= 60 ? 'text-amber-600' : 'text-red-500'}`}>{ts.wce.toFixed(1)}%</td>
                                  <td className="p-3 text-right font-black text-emerald-700 tracking-widest">{ts.grouping}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          Means sharing the same letter are not significantly different ({postHocMethod === 'tukey' ? 'Tukey HSD' : "Fisher's LSD"}, α=0.05).
                          {isFinite(analysisResults.postHoc?.value) && <span className="ml-2 font-semibold text-slate-500">{postHocMethod === 'tukey' ? 'HSD' : 'LSD'} (0.05) = {analysisResults.postHoc.value.toFixed(2)}</span>}
                        </p>
                      </div>
                    )}

                    {/* ANOVA Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                      <h3 className="font-bold text-slate-800 mb-4 text-sm">ANOVA Results (Two-way RCBD)</h3>
                      <div className="overflow-x-auto -mx-5 px-5">
                        <table className="w-full text-sm text-left min-w-[460px]">
                          <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                            <tr>
                              {['Source', 'DF', 'SS', 'MS', 'F', 'P', 'Sig'].map(h => <th key={h} className="p-3 text-right first:text-left">{h}</th>)}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            <tr>
                              <td className="p-3 font-medium">Treatment</td>
                              <td className="p-3 text-right">{analysisResults.anova?.dfTreat ?? '—'}</td>
                              <td className="p-3 text-right">{isFinite(analysisResults.anova?.ssTreat) ? analysisResults.anova.ssTreat.toFixed(2) : '—'}</td>
                              <td className="p-3 text-right">{isFinite(analysisResults.anova?.msTreat) ? analysisResults.anova.msTreat.toFixed(2) : '—'}</td>
                              <td className="p-3 text-right font-bold">{isFinite(analysisResults.anova?.fVal) ? analysisResults.anova.fVal.toFixed(2) : '—'}</td>
                              <td className={`p-3 text-right ${(analysisResults.anova?.pVal ?? 1) < 0.05 ? 'text-emerald-600 font-bold' : ''}`}>
                                {isFinite(analysisResults.anova?.pVal) ? analysisResults.anova.pVal.toFixed(4) : '—'}
                              </td>
                              <td className="p-3 text-right">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${ (analysisResults.anova?.pVal ?? 1) < 0.05 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {sigStars(analysisResults.anova?.pVal)}
                                </span>
                              </td>
                            </tr>
                            {isFinite(analysisResults.anova?.ssBlock) && (
                              <tr>
                                <td className="p-3 font-medium">Block</td>
                                <td className="p-3 text-right">{analysisResults.anova?.dfBlock ?? '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova?.ssBlock) ? analysisResults.anova.ssBlock.toFixed(2) : '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova?.msBlock) ? analysisResults.anova.msBlock.toFixed(2) : '—'}</td>
                                <td className="p-3 text-right"></td><td className="p-3 text-right"></td><td className="p-3 text-right"></td>
                              </tr>
                            )}
                            <tr>
                              <td className="p-3 font-medium">Error</td>
                              <td className="p-3 text-right">{analysisResults.anova?.dfError ?? '—'}</td>
                              <td className="p-3 text-right">{isFinite(analysisResults.anova?.ssError) ? analysisResults.anova.ssError.toFixed(2) : '—'}</td>
                              <td className="p-3 text-right">{isFinite(analysisResults.anova?.msError) ? analysisResults.anova.msError.toFixed(2) : '—'}</td>
                              <td className="p-3 text-right"></td><td className="p-3 text-right"></td><td className="p-3 text-right"></td>
                            </tr>
                            {isFinite(analysisResults.anova?.ssTotal) && (
                              <tr className="bg-slate-50 font-semibold">
                                <td className="p-3">Total</td>
                                <td className="p-3 text-right">{analysisResults.anova?.dfTotal ?? '—'}</td>
                                <td className="p-3 text-right">{analysisResults.anova.ssTotal.toFixed(2)}</td>
                                <td className="p-3 text-right"></td><td className="p-3 text-right"></td><td className="p-3 text-right"></td><td className="p-3 text-right"></td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                        {isFinite(analysisResults.anova?.cv) && <span>CV: <strong className="text-slate-700">{analysisResults.anova.cv.toFixed(1)}%</strong></span>}
                        {isFinite(analysisResults.postHoc?.value) && <span>{postHocMethod === 'tukey' ? 'HSD' : 'LSD'} (0.05): <strong className="text-slate-700">{analysisResults.postHoc.value.toFixed(2)}</strong></span>}
                        <span>Design: <strong className="text-slate-700">{analysisResults.balance?.isBalanced ? 'Balanced RCBD' : 'Unbalanced RCBD (robust)'}</strong></span>
                        {isFinite(analysisResults.anova?.grandMean) && <span>Grand Mean: <strong className="text-slate-700">{analysisResults.anova.grandMean.toFixed(2)}</strong></span>}
                      </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Per-treatment WCE timeline */}
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                        <h4 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" /> WCE % Over Time (per Treatment)</h4>
                        {wceTimelineData.daas.length > 0 && wceTimelineData.series.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="text-xs w-full min-w-max">
                              <thead>
                                <tr className="bg-slate-50">
                                  <th className="p-2 text-left font-semibold text-slate-500">Treatment</th>
                                  {wceTimelineData.daas.map(d => <th key={d} className="p-2 text-center font-semibold text-slate-500">{d}</th>)}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {wceTimelineData.series.map((s, i) => (
                                  <tr key={i} className="hover:bg-slate-50">
                                    <td className="p-2 font-medium text-slate-700 max-w-[120px] truncate" title={s.name}>{s.name}</td>
                                    {s.values.map((v, j) => (
                                      <td key={j} className={`p-2 text-center font-semibold ${
                                        v === null ? 'text-slate-300' : v >= 80 ? 'text-emerald-600' : v >= 60 ? 'text-amber-600' : 'text-red-500'
                                      }`}>{v !== null ? `${v}` : '—'}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : <p className="text-xs text-slate-400 py-4 text-center">No observation data yet</p>}
                      </div>
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                        <h4 className="font-bold text-sm text-slate-700 mb-4 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-blue-500" /> Final Treatment Means</h4>
                        <InlineBarChart data={perfChartData} color="#3b82f6" height={120} />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Agronomist Narrative ── */}
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-bold text-indigo-900 flex items-center gap-2"><FileText className="w-4 h-4" /> Agronomist Narrative</h3>
                      <p className="text-xs text-indigo-600 mt-0.5">AI-generated summary. Edit and save.</p>
                    </div>
                    <button onClick={handleGenerateNarrative} disabled={isGeneratingNarrative}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold transition">
                      {isGeneratingNarrative ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {isGeneratingNarrative ? 'Generating…' : 'Generate AI Narrative'}
                    </button>
                  </div>
                  <textarea
                    value={narrative}
                    onChange={e => setNarrative(e.target.value)}
                    rows={8}
                    className="w-full p-3 rounded-lg border-0 shadow-inner bg-white/80 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
                    placeholder="Click 'Generate AI Narrative' or type your narrative here…"
                  />
                  <button onClick={handleSaveNarrative} disabled={isSavingNarrative}
                    className="mt-3 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-bold transition">
                    {isSavingNarrative ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSavingNarrative ? 'Saving…' : 'Save Narrative'}
                  </button>
                </div>

              </div>

              {/* ── RIGHT: sidebar ── */}
              <div className="xl:col-span-1 space-y-4">

                {/* Project Scope */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <h3 className="font-bold text-slate-800 mb-4 text-sm">Project Scope</h3>
                  <ul className="space-y-2.5 text-sm">
                    {[
                      ['Blocks', projectBlocks.length],
                      ['Treatments', treatments.length],
                      ['Total Plots', projectTrials.length],
                      ['Crop', activeProject.Crop || 'N/A'],
                      ['Location', activeProject.Location || 'N/A'],
                      ['Investigator', activeProject.Investigator || 'N/A'],
                      ['Metric', activeProject.Metric],
                    ].map(([label, val]) => (
                      <li key={label} className="flex justify-between border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-bold text-slate-800 truncate max-w-[120px] text-right" title={String(val)}>{val}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actions */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <h3 className="font-bold text-slate-800 mb-3 text-sm">Actions</h3>
                  <div className="space-y-1">
                    {[
                      { label: isLocked ? 'Refresh Report' : 'Run Analysis', icon: BarChart2, color: 'text-emerald-700 hover:bg-emerald-50', action: () => runAnalysis(postHocMethod) },
                      { label: 'Recalculate DAA', icon: RefreshCw, color: 'text-amber-700 hover:bg-amber-50', action: handleRecalcDAA },
                      { label: 'Randomize Layout', icon: Shuffle, color: 'text-emerald-700 hover:bg-emerald-50', action: handleRandomizeLayout, disabled: isLocked },
                      { label: 'Protocol Settings', icon: ClipboardList, color: 'text-blue-700 hover:bg-blue-50', action: openProtocolSettings, disabled: isLocked },
                    ].map(({ label, icon: Icon, color, action, disabled }) => (
                      <button key={label} onClick={action} disabled={disabled}
                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition ${color} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        <Icon className="w-4 h-4 shrink-0" /> {label}
                      </button>
                    ))}
                    <hr className="my-2 border-slate-100" />
                    <button onClick={handleExportR} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-blue-700 hover:bg-blue-50 transition">
                      <Download className="w-4 h-4" /> Export to R (CSV)
                    </button>
                    <button onClick={handleExportSAS} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-green-700 hover:bg-green-50 transition">
                      <Download className="w-4 h-4" /> Export to SAS
                    </button>
                    <button onClick={handleExportBundle} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition">
                      <Package className="w-4 h-4" /> Export Analysis Bundle
                    </button>
                    <button onClick={handleScientificReport} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50 transition">
                      <FileText className="w-4 h-4" /> Scientific Report
                    </button>
                    <button onClick={handleRegulatoryPDF} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-purple-700 hover:bg-purple-50 transition">
                      <Printer className="w-4 h-4" /> Regulatory Report (PDF)
                    </button>
                    <button onClick={handleRegulatoryDOCX} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-fuchsia-700 hover:bg-fuchsia-50 transition">
                      <FileText className="w-4 h-4" /> Export DOCX
                    </button>
                    <hr className="my-2 border-slate-100" />
                    <button onClick={handleLockToggle}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition ${isLocked ? 'text-amber-700 hover:bg-amber-50' : 'text-red-700 hover:bg-red-50'}`}>
                      {isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      {isLocked ? 'Unlock Project' : 'Lock Project'}
                    </button>
                  </div>
                </div>

                {/* Weather conditions from trials */}
                {(() => {
                  const temps = projectTrials.map(t => parseFloat(t.Temperature)).filter(n => isFinite(n));
                  const hums = projectTrials.map(t => parseFloat(t.Humidity)).filter(n => isFinite(n));
                  const rains = projectTrials.map(t => parseFloat(t.Rain)).filter(n => isFinite(n));
                  if (temps.length === 0) return null;
                  const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 'N/A';
                  return (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                      <h3 className="font-bold text-slate-800 mb-3 text-sm">Avg Weather Conditions</h3>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-orange-50 rounded-lg p-2 border border-orange-100"><div className="font-bold text-orange-700">{avg(temps)}°C</div><div className="text-slate-400">Temp</div></div>
                        <div className="bg-blue-50 rounded-lg p-2 border border-blue-100"><div className="font-bold text-blue-700">{avg(hums)}%</div><div className="text-slate-400">Humidity</div></div>
                        <div className="bg-slate-50 rounded-lg p-2 border border-slate-200"><div className="font-bold text-slate-700">{avg(rains)}mm</div><div className="text-slate-400">Rain</div></div>
                      </div>
                    </div>
                  );
                })()}

              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Projects (RCBD)" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <h2 className="text-xl font-bold text-slate-800">All RCBD Projects</h2>
          <button onClick={() => { setFormData({ Name: '', Metric: 'Weed Control Efficiency', TargetWeed: '', Crop: '', Location: '', Investigator: '', StartDate: '' }); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition">
            <Plus className="w-4 h-4" /> New Project
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.length > 0 ? projects.map(p => {
            const pb = (state.blocks || []).filter(b => b.ProjectID === p.ID);
            const pt = (state.trials || []).filter(t => t.ProjectID === p.ID);
            const treats = [...new Set(pt.map(t => t.FormulationName).filter(Boolean))];
            const statusClass = p.Status === 'Locked' ? 'bg-slate-800 text-white' : p.Status === 'Finalized' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';

            return (
              <div key={p.ID} onClick={() => openProject(p.ID)}
                className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition cursor-pointer active:scale-[0.99]">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 truncate">{p.Name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusClass}`}>{p.Status || 'Draft'}</span>
                  </div>
                  <button onClick={(e) => handleDelete(e, p.ID)} className="text-slate-300 hover:text-red-500 transition p-1 shrink-0 ml-2">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2 mb-4 text-sm text-slate-500">
                  <div className="flex items-center gap-2"><Layers className="h-3.5 w-3.5" /><span>{pb.length} Block{pb.length !== 1 ? 's' : ''}</span></div>
                  <div className="flex items-center gap-2"><Beaker className="h-3.5 w-3.5" /><span>{pt.length} Plot{pt.length !== 1 ? 's' : ''} · {treats.length} Treatment{treats.length !== 1 ? 's' : ''}</span></div>
                  <div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5" /><span className="truncate">Metric: {p.Metric || 'WCE'}</span></div>
                  {p.Crop && <div className="flex items-center gap-2 text-xs"><span className="text-slate-400">Crop:</span><span>{p.Crop}</span></div>}
                  {p.Location && <div className="flex items-center gap-2 text-xs"><span className="text-slate-400">Location:</span><span className="truncate">{p.Location}</span></div>}
                </div>

                <div className="pt-3 border-t border-slate-50 flex justify-between items-center">
                  <span className="text-[10px] text-slate-400">{formatDateTime(p.CreatedAt) || '—'}</span>
                  <span className="text-emerald-600 font-bold text-xs flex items-center gap-1">View Dashboard <ChevronRight className="h-3.5 w-3.5" /></span>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full text-center py-14 bg-white rounded-xl border-2 border-dashed border-slate-200">
              <Layers className="w-10 h-10 mx-auto text-slate-200 mb-3" />
              <p className="text-slate-500 mb-3">No RCBD Projects yet.</p>
              <button onClick={() => setIsModalOpen(true)} className="text-emerald-600 font-bold hover:underline text-sm">Create your first project →</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Create Project Modal ── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New RCBD Project">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Project Name *</label>
            <input required value={formData.Name} onChange={e => setFormData(v => ({ ...v, Name: e.target.value }))} className={INPUT} placeholder="e.g., 2024 Pre-Emergent Corn Study" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Location</label>
              <input value={formData.Location} onChange={e => setFormData(v => ({ ...v, Location: e.target.value }))} className={INPUT} placeholder="e.g., North Field" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Crop</label>
              <input value={formData.Crop} onChange={e => setFormData(v => ({ ...v, Crop: e.target.value }))} className={INPUT} placeholder="e.g., Corn" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Investigator</label>
              <input value={formData.Investigator} onChange={e => setFormData(v => ({ ...v, Investigator: e.target.value }))} className={INPUT} placeholder="Lead researcher name" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Start Date</label>
              <input type="datetime-local" value={toDatetimeLocal(formData.StartDate)} onChange={e => setFormData(v => ({ ...v, StartDate: e.target.value }))} className={INPUT} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Target Weed Species</label>
            <input value={formData.TargetWeed} onChange={e => setFormData(v => ({ ...v, TargetWeed: e.target.value }))} className={INPUT} placeholder="e.g., Amaranthus palmeri" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Primary Metric</label>
            <select value={formData.Metric} onChange={e => setFormData(v => ({ ...v, Metric: e.target.value }))} className={INPUT}>
              <option value="Weed Control Efficiency">Weed Control Efficiency (%)</option>
              <option value="Crop Injury">Crop Injury / Phytotoxicity (%)</option>
              <option value="Yield">Yield (kg/ha)</option>
              <option value="Biomass Reduction">Biomass Reduction (%)</option>
            </select>
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancel</button>
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-bold">Create Project</button>
          </div>
        </form>
      </Modal>

      {/* ── Randomize Layout Modal ── */}
      <Modal isOpen={isRandomizeModalOpen} onClose={() => setIsRandomizeModalOpen(false)} title="Randomize Layout">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Randomize plot arrangement within a block using Fisher-Yates shuffle algorithm.</p>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Select Block</label>
            <select value={randomizeBlockId} onChange={e => setRandomizeBlockId(e.target.value)} className={INPUT}>
              <option value="">Select a block...</option>
              {(state.blocks || []).filter(b => b.ProjectID === activeProject?.ID).map(b => (
                <option key={b.ID} value={b.ID}>{b.Name}</option>
              ))}
            </select>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-800">
            <strong>Warning:</strong> Randomization will assign a new random order to all plots in the selected block. This action cannot be undone.
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsRandomizeModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancel</button>
            <button onClick={applyRandomization} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
              <Shuffle className="w-4 h-4" /> Apply Randomization
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Protocol Settings Modal ── */}
      <Modal isOpen={isProtocolModalOpen} onClose={() => setIsProtocolModalOpen(false)} title="Protocol Settings">
        <form onSubmit={(e) => { e.preventDefault(); saveProtocolSettings(); }} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Target Weed</label>
              <input value={protocolForm.TargetWeed} onChange={e => setProtocolForm(v => ({ ...v, TargetWeed: e.target.value }))} className={INPUT} placeholder="e.g., Echinochloa crus-galli" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Crop</label>
              <input value={protocolForm.Crop} onChange={e => setProtocolForm(v => ({ ...v, Crop: e.target.value }))} className={INPUT} placeholder="e.g., Rice (Oryza sativa)" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Primary Metric</label>
            <select value={protocolForm.Metric} onChange={e => setProtocolForm(v => ({ ...v, Metric: e.target.value }))} className={INPUT}>
              <option value="Weed Control Efficiency">Weed Control Efficiency (%)</option>
              <option value="Crop Injury">Crop Injury / Phytotoxicity (%)</option>
              <option value="Yield">Yield (kg/ha)</option>
              <option value="Biomass Reduction">Biomass Reduction (%)</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Application Timing</label>
              <select value={protocolForm.ApplicationTiming} onChange={e => setProtocolForm(v => ({ ...v, ApplicationTiming: e.target.value }))} className={INPUT}>
                <option value="">Select timing...</option>
                <option value="Pre-emergence">Pre-emergence</option>
                <option value="Post-emergence early">Post-emergence (early)</option>
                <option value="Post-emergence late">Post-emergence (late)</option>
                <option value="Pre-plant">Pre-plant incorporated</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Spray Volume (L/ha)</label>
              <input type="number" min="0" step="10" value={protocolForm.SprayVolume} onChange={e => setProtocolForm(v => ({ ...v, SprayVolume: e.target.value }))} className={INPUT} placeholder="e.g., 200" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Protocol Notes</label>
            <textarea rows={4} value={protocolForm.Notes} onChange={e => setProtocolForm(v => ({ ...v, Notes: e.target.value }))} className={`${INPUT} resize-y`} placeholder="Additional protocol details, application methods, timing constraints..." />
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsProtocolModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancel</button>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Protocol Settings
            </button>
          </div>
        </form>
      </Modal>

      {/* Plot Map Modal */}
      {showMap && activeProject && (
        <PlotMap 
          projectId={activeProject.ID}
          onClose={() => setShowMap(false)}
        />
      )}
    </div>
  );
}