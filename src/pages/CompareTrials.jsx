import React, { useState, useMemo } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import { safeJsonParse } from '../utils/helpers.js';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, Activity, ArrowLeft, CheckCircle, X, Thermometer, Droplets, Wind, CloudRain } from 'lucide-react';

const RESULT_BADGE = {
  Excellent: 'bg-emerald-100 text-emerald-700',
  Good: 'bg-blue-100 text-blue-700',
  Fair: 'bg-amber-100 text-amber-700',
  Poor: 'bg-red-100 text-red-700',
};

const COLORS = ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316'];

export default function CompareTrials({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const navigate = useNavigate();
  const [aiSummary, setAiSummary] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedTrials = state.selectedTrials || [];

  const removeFromComparison = (id) => {
    updateState({ selectedTrials: selectedTrials.filter(t => t.ID !== id) });
  };

  // Build per-trial efficacy series
  const trialSeries = useMemo(() => selectedTrials.map(t => {
    const eff = safeJsonParse(t.EfficacyDataJSON, []).sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
    const baselineCover = eff.length > 0 ? (Number(eff[0].weedCover) || 0) : null;
    return {
      trial: t,
      eff,
      baselineCover,
      finalWce: eff.length > 0
        ? (eff[eff.length - 1].controlPct !== undefined
          ? Number(eff[eff.length - 1].controlPct)
          : baselineCover > 0
            ? Math.round(((baselineCover - Number(eff[eff.length - 1].weedCover)) / baselineCover) * 100)
            : null)
        : null,
    };
  }), [selectedTrials]);

  // Collect all unique DAA points across all trials
  const allDaa = useMemo(() => {
    const set = new Set();
    trialSeries.forEach(({ eff }) => eff.forEach(o => set.add(Number(o.daa ?? 0))));
    return [...set].sort((a, b) => a - b);
  }, [trialSeries]);

  const handleGenerateSummary = async () => {
    if (selectedTrials.length < 2) return;
    setIsGenerating(true);
    setAiSummary(null);
    const contextData = trialSeries.map(({ trial, finalWce }) =>
      `Formulation: ${trial.FormulationName}, Target: ${trial.WeedSpecies || 'N/A'}, Dosage: ${trial.Dosage || 'N/A'}, Final WCE: ${finalWce !== null ? finalWce + '%' : 'No data'}`
    ).join('\n');
    const prompt = `Compare these herbicide trials and give a concise 3-bullet executive summary of which formulation performed best and why:\n\n${contextData}`;
    try {
      const apiKeys = getAppState()?.settings?.apiKeys || [];
      const key = apiKeys[0]?.key || apiKeys[0];
      if (!key) { setAiSummary('No Gemini API key configured. Add one in Settings → AI Keys.'); return; }
      const modelName = getAppState()?.settings?.selectedModel || 'gemini-2.0-flash';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      setAiSummary(text || 'No response from AI.');
    } catch (e) {
      setAiSummary('Error contacting AI: ' + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  if (selectedTrials.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
        <TopBar title="Compare Trials" onMenuClick={onMenuClick} />
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
          <Activity className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-semibold text-lg">No trials selected</p>
          <p className="text-sm mt-2 max-w-sm">Go to the Trials page, select 2+ trials using the bulk selection bar, then click Compare.</p>
          <button onClick={() => navigate('/trials')} className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition">
            <ArrowLeft className="w-4 h-4" />Go to Trials
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Compare Trials" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4 max-w-7xl mx-auto w-full space-y-5">

        {/* Trial chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-semibold text-slate-500">Comparing:</span>
          {selectedTrials.map((t, i) => (
            <span key={t.ID} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold text-white" style={{ backgroundColor: COLORS[i % COLORS.length] }}>
              {t.FormulationName}
              <button onClick={() => removeFromComparison(t.ID)} className="opacity-70 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
          <button onClick={() => navigate('/trials')} className="ml-auto text-xs text-emerald-600 font-semibold hover:underline flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />Add / Change Trials
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trialSeries.map(({ trial, eff, finalWce, baselineCover }, i) => {
            const isCompleted = trial.IsCompleted === true || trial.IsCompleted === 'true';
            return (
              <div key={trial.ID} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1.5" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <div className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">{trial.FormulationName}</h3>
                      <p className="text-xs text-slate-400">{trial.Location || '—'} · {trial.Date ? new Date(trial.Date).toLocaleDateString() : '—'}</p>
                    </div>
                    {isCompleted && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-400 font-semibold">Dosage</p><p className="font-bold text-slate-700 truncate">{trial.Dosage || '—'}</p></div>
                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-400 font-semibold">Target Weed</p><p className="font-bold text-slate-700 truncate">{trial.WeedSpecies || '—'}</p></div>
                    <div className="bg-emerald-50 rounded-lg p-2 col-span-2 flex items-center justify-between">
                      <p className="text-emerald-600 font-semibold">Final WCE</p>
                      <p className="text-2xl font-bold text-emerald-700">{finalWce !== null ? `${finalWce}%` : '—'}</p>
                    </div>
                  </div>
                  {trial.Result && (
                    <span className={`mt-2 inline-block text-xs font-bold px-2 py-0.5 rounded-full ${RESULT_BADGE[trial.Result] || 'bg-slate-100 text-slate-600'}`}>{trial.Result}</span>
                  )}
                  {eff.length > 0 && (
                    <p className="text-xs text-slate-400 mt-2">{eff.length} observation{eff.length !== 1 ? 's' : ''} · Baseline cover: {baselineCover !== null ? `${baselineCover}%` : '—'}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* WCE Bar Chart */}
        {trialSeries.some(s => s.finalWce !== null) && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-bold text-slate-800 mb-4">Final WCE Comparison</h3>
            <div className="space-y-3">
              {trialSeries.map(({ trial, finalWce }, i) => (
                <div key={trial.ID}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700 truncate max-w-[60%]">{trial.FormulationName}</span>
                    <span className="font-bold" style={{ color: COLORS[i % COLORS.length] }}>{finalWce !== null ? `${finalWce}%` : '—'}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    {finalWce !== null && (
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, finalWce))}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500" />AI Executive Summary</h3>
            <button onClick={handleGenerateSummary} disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGenerating ? 'Analysing...' : 'Generate Summary'}
            </button>
          </div>
          {aiSummary ? (
            <div className="bg-indigo-50 rounded-xl p-4 text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed"
              dangerouslySetInnerHTML={{ __html: aiSummary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
          ) : (
            <p className="text-sm text-slate-400">Click "Generate Summary" to get an AI-powered comparative analysis of the selected trials.</p>
          )}
        </div>

        {/* DAA Timeline Table */}
        {allDaa.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800">Weed Cover Timeline (% per DAA)</h3>
              <p className="text-xs text-slate-400 mt-0.5">Comparing weed cover % at each Days After Application point</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3 font-semibold text-slate-600 sticky left-0 bg-slate-50">DAA</th>
                    {trialSeries.map(({ trial }, i) => (
                      <th key={trial.ID} className="px-5 py-3 font-semibold whitespace-nowrap" style={{ color: COLORS[i % COLORS.length] }}>
                        {trial.FormulationName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {allDaa.map(daa => (
                    <tr key={daa} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-bold text-slate-700 sticky left-0 bg-white">DAA {daa}</td>
                      {trialSeries.map(({ trial, eff }, i) => {
                        const obs = eff.find(o => Number(o.daa ?? 0) === daa);
                        return (
                          <td key={trial.ID} className="px-5 py-3">
                            {obs ? (
                              <span className="font-semibold text-slate-800">{obs.weedCover}%
                                {obs.controlPct !== undefined && <span className="text-xs text-emerald-600 ml-1">({obs.controlPct}% ctrl)</span>}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Side-by-side detail */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="font-bold text-slate-800">Full Comparison Table</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3 font-semibold text-slate-600">Field</th>
                  {trialSeries.map(({ trial }, i) => (
                    <th key={trial.ID} className="px-5 py-3 font-semibold" style={{ color: COLORS[i % COLORS.length] }}>{trial.FormulationName}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  ['Location', t => t.Location || '—'],
                  ['Date', t => t.Date ? new Date(t.Date).toLocaleDateString() : '—'],
                  ['Dosage', t => t.Dosage || '—'],
                  ['Target Weeds', t => t.WeedSpecies || '—'],
                  ['Investigator', t => t.InvestigatorName || '—'],
                  ['Result', t => t.Result || '—'],
                  ['Temperature', t => t.Temperature ? `${t.Temperature}°C` : '—'],
                  ['Humidity', t => t.Humidity ? `${t.Humidity}%` : '—'],
                  ['Wind Speed', t => t.Windspeed ? `${t.Windspeed} km/h` : '—'],
                  ['Rainfall', t => t.Rain ? `${t.Rain} mm` : '—'],
                  ['Observations', t => safeJsonParse(t.EfficacyDataJSON, []).length],
                  ['Photos', t => safeJsonParse(t.PhotoURLs, []).length],
                  ['Status', t => (t.IsCompleted === true || t.IsCompleted === 'true') ? 'Finalized' : 'Active'],
                ].map(([label, getter]) => (
                  <tr key={label} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-semibold text-slate-500">{label}</td>
                    {trialSeries.map(({ trial }) => (
                      <td key={trial.ID} className="px-5 py-3 text-slate-700">{getter(trial)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
