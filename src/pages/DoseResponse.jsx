/**
 * Dose-Response Curve Page
 * ED50/GR50 analysis using 4-parameter log-logistic model
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import { fitDoseResponse, extractDoseResponseData, compareDoseResponseCurves } from '../utils/doseResponseUtils.js';
import {
  TrendingUp, FlaskConical, Leaf, Info, Download,
  Plus, Trash2, RefreshCw, ChevronDown, BarChart3, AlertTriangle
} from 'lucide-react';

const COLORS = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6'];

function StatPill({ label, value, unit = '', color = 'emerald', tooltip = '' }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color]}`} title={tooltip}>
      <p className="text-xs font-bold uppercase opacity-70 mb-0.5">{label}</p>
      <p className="text-xl font-bold">{value !== null && value !== undefined ? `${value}${unit}` : '–'}</p>
    </div>
  );
}

export default function DoseResponse({ onMenuClick }) {
  const { state } = useAppState();
  const canvasRef = useRef(null);

  const trials = state.trials || [];
  const formulations = state.formulations || [];

  // ── Filter state
  const [selectedFormulation, setSelectedFormulation] = useState('');
  const [selectedWeed, setSelectedWeed] = useState('');
  const [targetDaa, setTargetDaa] = useState('');
  const [compareFormulation, setCompareFormulation] = useState('');

  // ── Manual data override
  const [manualPoints, setManualPoints] = useState([]);
  const [showManual, setShowManual] = useState(false);
  const [newDose, setNewDose] = useState('');
  const [newResponse, setNewResponse] = useState('');

  // Unique weed species from trials
  const weedSpecies = useMemo(() => [...new Set(trials.map(t => t.WeedSpecies).filter(Boolean))].sort(), [trials]);
  const formulationNames = useMemo(() => [...new Set(trials.map(t => t.FormulationName).filter(Boolean))].sort(), [trials]);

  // Extract data from trials
  const primaryData = useMemo(() => {
    if (!selectedFormulation) return [];
    const fromTrials = extractDoseResponseData(trials, selectedFormulation, selectedWeed || null, targetDaa ? parseInt(targetDaa) : null);
    return [...fromTrials, ...manualPoints];
  }, [trials, selectedFormulation, selectedWeed, targetDaa, manualPoints]);

  const compareData = useMemo(() => {
    if (!compareFormulation) return [];
    return extractDoseResponseData(trials, compareFormulation, selectedWeed || null, targetDaa ? parseInt(targetDaa) : null);
  }, [trials, compareFormulation, selectedWeed, targetDaa]);

  // Fit curves
  const primaryFit = useMemo(() => {
    if (primaryData.length < 3) return null;
    return fitDoseResponse(primaryData);
  }, [primaryData]);

  const compareFit = useMemo(() => {
    if (compareData.length < 3) return null;
    return fitDoseResponse(compareData);
  }, [compareData]);

  const comparison = useMemo(() => {
    if (!primaryFit || !compareFit) return null;
    return compareDoseResponseCurves(primaryFit, compareFit);
  }, [primaryFit, compareFit]);

  // Draw chart on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 30, right: 30, bottom: 55, left: 60 };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, W, H);

    const fits = [
      primaryFit ? { fit: primaryFit, data: primaryData, color: COLORS[0], label: selectedFormulation || 'Primary' } : null,
      compareFit ? { fit: compareFit, data: compareData, color: COLORS[1], label: compareFormulation || 'Compare' } : null,
    ].filter(Boolean);

    if (fits.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Select a formulation with ≥3 data points to fit a curve', W / 2, H / 2);
      return;
    }

    // Determine axis ranges
    const allDoses = fits.flatMap(f => f.data.map(d => d.dose)).filter(d => d > 0);
    const allCurve = fits.flatMap(f => f.fit.curvePoints.map(p => p.dose));
    const maxDose = Math.max(...allDoses, ...allCurve);
    const minDose = Math.min(...allDoses.filter(d => d > 0));
    const logMin = Math.log10(Math.max(0.01, minDose * 0.5));
    const logMax = Math.log10(maxDose * 1.2);

    const xScale = d => d <= 0 ? PAD.left : PAD.left + ((Math.log10(d) - logMin) / (logMax - logMin)) * (W - PAD.left - PAD.right);
    const yScale = r => PAD.top + (1 - r / 100) * (H - PAD.top - PAD.bottom);

    // Grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    [0, 20, 40, 60, 80, 100].forEach(y => {
      const py = yScale(y);
      ctx.beginPath(); ctx.moveTo(PAD.left, py); ctx.lineTo(W - PAD.right, py); ctx.stroke();
      ctx.fillStyle = '#64748b'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(`${y}%`, PAD.left - 5, py + 4);
    });

    // X axis ticks (log scale)
    const logRange = logMax - logMin;
    for (let l = Math.ceil(logMin); l <= Math.floor(logMax); l++) {
      const px = xScale(Math.pow(10, l));
      ctx.beginPath(); ctx.moveTo(px, PAD.top); ctx.lineTo(px, H - PAD.bottom); ctx.stroke();
      ctx.fillStyle = '#64748b'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(Math.pow(10, l).toString(), px, H - PAD.bottom + 16);
    }

    // Axis labels
    ctx.fillStyle = '#475569'; ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Dose (g ai/ha)', W / 2, H - 5);
    ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('Control (%)', 0, 0); ctx.restore();

    // Axes
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, H - PAD.bottom); ctx.lineTo(W - PAD.right, H - PAD.bottom); ctx.stroke();

    // Draw ED50 reference line for primary
    if (primaryFit?.ed50) {
      const px = xScale(primaryFit.ed50);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = COLORS[0] + '88';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, PAD.top); ctx.lineTo(px, H - PAD.bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS[0];
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`ED₅₀=${primaryFit.ed50}`, px, PAD.top - 8);
    }

    // Draw fitted curves + data points
    fits.forEach(({ fit, data, color, label }, fi) => {
      // Curve
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      fit.curvePoints.forEach((pt, i) => {
        const px = xScale(pt.dose);
        const py = yScale(pt.response);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();

      // Data points
      data.forEach(pt => {
        const px = xScale(Math.max(0.01, pt.dose));
        const py = yScale(pt.response);
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Legend
      const lx = PAD.left + 10 + fi * 160;
      const ly = PAD.top + 12;
      ctx.fillStyle = color; ctx.fillRect(lx, ly - 8, 20, 3);
      ctx.fillStyle = '#374151'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(label.length > 18 ? label.slice(0, 17) + '…' : label, lx + 24, ly);
    });

  }, [primaryFit, compareFit, primaryData, compareData, selectedFormulation, compareFormulation]);

  const handleAddManual = () => {
    const dose = parseFloat(newDose);
    const resp = parseFloat(newResponse);
    if (isNaN(dose) || isNaN(resp) || dose < 0 || resp < 0 || resp > 100) return;
    setManualPoints(prev => [...prev, { dose, response: resp }]);
    setNewDose(''); setNewResponse('');
  };

  const handleExportCSV = () => {
    if (!primaryFit) return;
    const rows = [
      ['Parameter', 'Value'],
      ['Formulation', selectedFormulation],
      ['Weed Species', selectedWeed || 'All'],
      ['ED10 (g ai/ha)', primaryFit.ed10 ?? '–'],
      ['ED50 (g ai/ha)', primaryFit.ed50 ?? '–'],
      ['ED90 (g ai/ha)', primaryFit.ed90 ?? '–'],
      ['Slope (b)', primaryFit.params.b.toFixed(3)],
      ['Lower asymptote (c)', primaryFit.params.c.toFixed(1)],
      ['Upper asymptote (d)', primaryFit.params.d.toFixed(1)],
      ['R²', primaryFit.r2],
      ['Selectivity Index (ED90/ED10)', primaryFit.selectivityIndex ?? '–'],
      [],
      ['Dose', 'Observed %', 'Predicted %', 'Residual', 'Location', 'Date'],
      ...primaryFit.residuals.map((r, i) => [
        r.dose, r.observed, r.predicted, r.residual,
        primaryData[i]?.location || '', primaryData[i]?.date || ''
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dose-response-${selectedFormulation || 'curve'}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const INPUT = 'px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Dose-Response Curve" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full space-y-5">

        {/* ── Filters ── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-emerald-600" /> Curve Setup
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Formulation *</label>
              <select value={selectedFormulation} onChange={e => setSelectedFormulation(e.target.value)} className={INPUT + ' w-full'}>
                <option value="">— select —</option>
                {formulationNames.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Compare With</label>
              <select value={compareFormulation} onChange={e => setCompareFormulation(e.target.value)} className={INPUT + ' w-full'}>
                <option value="">— none —</option>
                {formulationNames.filter(f => f !== selectedFormulation).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Weed Species</label>
              <select value={selectedWeed} onChange={e => setSelectedWeed(e.target.value)} className={INPUT + ' w-full'}>
                <option value="">All species</option>
                {weedSpecies.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">DAA Observation</label>
              <input type="number" value={targetDaa} onChange={e => setTargetDaa(e.target.value)} placeholder="Latest" className={INPUT + ' w-full'} />
            </div>
          </div>

          {/* Data source info */}
          {selectedFormulation && (
            <div className={`mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
              primaryData.length >= 3 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {primaryData.length >= 3
                ? <><TrendingUp className="w-4 h-4" /> {primaryData.length} data points found — curve can be fitted</>
                : <><AlertTriangle className="w-4 h-4" /> Only {primaryData.length} point{primaryData.length !== 1 ? 's' : ''} found — need ≥3 to fit (add manually below)</>
              }
            </div>
          )}
        </div>

        {/* ── Chart ── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" /> Dose-Response Curve (LL.4 Model)
            </h3>
            {primaryFit && !primaryFit.error && (
              <button onClick={handleExportCSV} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            )}
          </div>
          <canvas ref={canvasRef} width={760} height={380} className="w-full rounded-lg border border-slate-100" />
        </div>

        {/* ── Results Cards ── */}
        {primaryFit && !primaryFit.error && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                {selectedFormulation} — Fitted Parameters
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
                <StatPill label="ED₁₀" value={primaryFit.ed10} unit=" g/ha" color="emerald"
                  tooltip="Dose causing 10% control — minimum effective dose" />
                <StatPill label="ED₅₀" value={primaryFit.ed50} unit=" g/ha" color="blue"
                  tooltip="Dose causing 50% control — standard potency benchmark" />
                <StatPill label="ED₉₀" value={primaryFit.ed90} unit=" g/ha" color="amber"
                  tooltip="Dose causing 90% control — recommended label rate benchmark" />
                <StatPill label="R²" value={primaryFit.r2} color={primaryFit.r2 >= 0.9 ? 'emerald' : primaryFit.r2 >= 0.7 ? 'amber' : 'red'}
                  tooltip="Goodness of fit — closer to 1.0 is better" />
                <StatPill label="Selectivity" value={primaryFit.selectivityIndex} color="purple"
                  tooltip="ED90/ED10 ratio — lower = steeper response curve" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
                <div><span className="font-semibold">Slope (b):</span> {primaryFit.params.b.toFixed(3)}</div>
                <div><span className="font-semibold">Lower (c):</span> {primaryFit.params.c.toFixed(1)}%</div>
                <div><span className="font-semibold">Upper (d):</span> {primaryFit.params.d.toFixed(1)}%</div>
                <div><span className="font-semibold">ED₅₀ (e):</span> {primaryFit.params.e.toFixed(2)} g/ha</div>
              </div>

              {primaryFit.r2 < 0.7 && (
                <div className="mt-3 flex items-start gap-2 text-sm bg-amber-50 text-amber-700 p-3 rounded-lg">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  Low R² ({primaryFit.r2}) — curve fit is poor. Ensure doses span a wide range and include near-zero and near-100% control points.
                </div>
              )}
            </div>

            {/* Residuals Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-800 mb-3 text-sm">Data Points & Residuals</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-slate-500 border-b border-slate-100">
                      <th className="text-left py-2 pr-4">Dose (g/ha)</th>
                      <th className="text-left py-2 pr-4">Observed %</th>
                      <th className="text-left py-2 pr-4">Predicted %</th>
                      <th className="text-left py-2 pr-4">Residual</th>
                      <th className="text-left py-2 pr-4">Location</th>
                      <th className="text-left py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {primaryFit.residuals.map((r, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-1.5 pr-4 font-medium">{r.dose}</td>
                        <td className="py-1.5 pr-4">{r.observed.toFixed(1)}</td>
                        <td className="py-1.5 pr-4 text-blue-600">{r.predicted}</td>
                        <td className={`py-1.5 pr-4 font-medium ${Math.abs(r.residual) > 15 ? 'text-red-500' : 'text-slate-500'}`}>
                          {r.residual > 0 ? '+' : ''}{r.residual}
                        </td>
                        <td className="py-1.5 pr-4 text-slate-400">{primaryData[i]?.location || '–'}</td>
                        <td className="py-1.5 text-slate-400">{primaryData[i]?.date || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {primaryFit?.error && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-5 h-5 shrink-0" /> {primaryFit.error}
          </div>
        )}

        {/* ── Comparison ── */}
        {comparison && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-600" /> Relative Potency Comparison
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <StatPill label={`${selectedFormulation} ED₅₀`} value={primaryFit.ed50} unit=" g/ha" color="emerald" />
              <StatPill label={`${compareFormulation} ED₅₀`} value={compareFit.ed50} unit=" g/ha" color="blue" />
              <StatPill label="Relative Potency" value={comparison.relativePotency} color="purple"
                tooltip="Ratio of ED50s. >1 = Formulation 2 more potent" />
              <StatPill label="Fit R²" value={compareFit.r2} color={compareFit.r2 >= 0.9 ? 'emerald' : 'amber'} />
            </div>
            <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-2">{comparison.interpretation}</p>
          </div>
        )}

        {/* ── Manual data entry ── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <button
            onClick={() => setShowManual(!showManual)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition w-full"
          >
            <Plus className="w-4 h-4" /> Add Manual Data Points
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showManual ? 'rotate-180' : ''}`} />
          </button>
          {showManual && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-500">Enter dose-response pairs manually (useful for literature data or multi-site averages)</p>
              <div className="flex gap-2 items-end">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Dose (g ai/ha)</label>
                  <input type="number" value={newDose} onChange={e => setNewDose(e.target.value)} className={INPUT} placeholder="e.g. 500" min="0" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Control (%)</label>
                  <input type="number" value={newResponse} onChange={e => setNewResponse(e.target.value)} className={INPUT} placeholder="0–100" min="0" max="100" />
                </div>
                <button onClick={handleAddManual} className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              {manualPoints.length > 0 && (
                <div className="space-y-1">
                  {manualPoints.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm bg-slate-50 rounded-lg px-3 py-1.5">
                      <span className="font-medium">{p.dose} g/ha</span>
                      <span className="text-slate-400">→</span>
                      <span>{p.response}% control</span>
                      <button onClick={() => setManualPoints(prev => prev.filter((_, j) => j !== i))} className="ml-auto text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Interpretation guide ── */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-800 space-y-1">
              <p><strong>LL.4 Model:</strong> f(x) = c + (d − c) / (1 + (x/e)^b) — Industry standard for herbicide dose-response analysis.</p>
              <p><strong>ED₅₀:</strong> Dose giving 50% weed control. Lower = more potent formulation.</p>
              <p><strong>ED₉₀:</strong> Dose for 90% control — use as minimum recommended field rate.</p>
              <p><strong>Selectivity Index (ED₉₀/ED₁₀):</strong> Lower values indicate a steeper, more reliable dose-response relationship.</p>
              <p><strong>R² ≥ 0.90</strong> = good fit. Add more dose levels (especially 0, low, mid, high, and ×2 recommended rate) for better accuracy.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
