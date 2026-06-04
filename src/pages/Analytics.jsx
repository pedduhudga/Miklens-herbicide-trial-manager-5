import React, { useMemo, useState, memo } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import ChartCard from '../components/ChartCard.jsx';
import { safeJsonParse } from '../utils/helpers.js';
import { BarChart3, TrendingUp, Leaf, Activity, ChevronDown, ChevronUp, Download } from 'lucide-react';

const CHART_COLORS = ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

const StatTile = memo(function StatTile({ label, value, sub, color = 'emerald' }) {
  const map = { emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100', blue: 'bg-blue-50 text-blue-700 border-blue-100', amber: 'bg-amber-50 text-amber-700 border-amber-100', purple: 'bg-purple-50 text-purple-700 border-purple-100' };
  return (
    <div className={`rounded-xl p-4 border ${map[color]}`}>
      <p className="text-xs font-bold uppercase opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
});

export default function Analytics({ onMenuClick }) {
  const { state } = useAppState();
  const [expandedSection, setExpandedSection] = useState(null);

  const trials = state.trials || [];
  const projects = state.projects || [];
  const formulations = state.formulations || [];

  // ── Summary stats ──────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalObs = trials.reduce((a, t) => a + safeJsonParse(t.EfficacyDataJSON, []).length, 0);
    const rated = trials.filter(t => t.Result);
    const excellent = rated.filter(t => t.Result === 'Excellent' || t.Result === 'Good').length;
    const successRate = rated.length > 0 ? Math.round((excellent / rated.length) * 100) : 0;
    const withPhotos = trials.filter(t => safeJsonParse(t.PhotoURLs, []).length > 0).length;
    const controlTrials = trials.filter(t => t.IsControl === true || t.IsControl === 'true').length;
    return { totalObs, successRate, withPhotos, controlTrials, rated: rated.length };
  }, [trials]);

  // ── Trials by month (last 12) ──────────────────────────────────
  const trialsByMonth = useMemo(() => {
    const months = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      months[key] = 0;
    }
    trials.forEach(t => {
      if (!t.Date) return;
      const d = new Date(t.Date);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (key in months) months[key]++;
    });
    return months;
  }, [trials]);

  // ── Efficacy by formulation (real avg of final obs controlPct) ──
  const efficacyByFormulation = useMemo(() => {
    const map = {};
    trials.forEach(t => {
      if (!t.FormulationName) return;
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length) return;
      const last = eff[eff.length - 1];
      if (last.controlPct === undefined) return;
      if (!map[t.FormulationName]) map[t.FormulationName] = [];
      map[t.FormulationName].push(Number(last.controlPct));
    });
    return Object.entries(map).map(([name, vals]) => ({
      name,
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      count: vals.length,
    })).sort((a, b) => b.avg - a.avg).slice(0, 10);
  }, [trials]);

  // ── Weed species frequency ──────────────────────────────────────
  const weedSpeciesFreq = useMemo(() => {
    const map = {};
    trials.forEach(t => {
      if (!t.WeedSpecies) return;
      t.WeedSpecies.split(',').forEach(s => {
        const name = s.trim();
        if (name) map[name] = (map[name] || 0) + 1;
      });
      safeJsonParse(t.EfficacyDataJSON, []).forEach(obs => {
        (obs.weedDetails || []).forEach(wd => {
          if (wd.species && wd.species !== 'Total') map[wd.species] = (map[wd.species] || 0) + 1;
        });
      });
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [trials]);

  // ── Environmental correlation data (scatter: env var vs efficacy) ──
  const envCorrData = useMemo(() => {
    const configs = [
      { key: 'Temperature', label: 'Temperature (°C)', color: '#f59e0b' },
      { key: 'Humidity',    label: 'Humidity (%)',     color: '#3b82f6' },
      { key: 'Windspeed',   label: 'Wind (km/h)',      color: '#6366f1' },
      { key: 'Rain',        label: 'Rain (mm)',        color: '#06b6d4' },
      { key: 'SoilPH',      label: 'Soil pH',          color: '#8b5cf6' },
    ];
    return configs.map(({ key, label, color }) => {
      const points = trials.map(t => {
        const envVal = parseFloat(t[key]);
        // Rain can be 0, so only check for finite values
        if (!isFinite(envVal) || envVal < 0) return null;
        // For non-rain fields, skip if 0 or negative
        if (key !== 'Rain' && envVal <= 0) return null;
        const eff = safeJsonParse(t.EfficacyDataJSON, []);
        let efficacy = null;
        if (eff.length > 0) {
          const last = eff[eff.length - 1];
          if (last.controlPct !== undefined) efficacy = Number(last.controlPct);
        }
        if (efficacy === null) {
          efficacy = t.Result === 'Excellent' ? 95 : t.Result === 'Good' ? 80 : t.Result === 'Fair' ? 60 : t.Result === 'Poor' ? 30 : null;
        }
        return efficacy !== null ? { x: envVal, y: efficacy } : null;
      }).filter(Boolean);
      return { key, label, color, points };
    });
  }, [trials]);

  // ── Performance radar (top 3 formulations) ──────────────────────
  const radarChartConfig = useMemo(() => {
    const formMap = {};
    trials.forEach(t => {
      if (!t.FormulationName) return;
      if (!formMap[t.FormulationName]) formMap[t.FormulationName] = [];
      formMap[t.FormulationName].push(t);
    });
    const top3 = Object.entries(formMap).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
    if (top3.length === 0) return null;
    const scoreColors = ['rgba(16,185,129,0.2)', 'rgba(59,130,246,0.2)', 'rgba(245,158,11,0.2)'];
    const borderColors = ['#10b981', '#3b82f6', '#f59e0b'];
    const datasets = top3.map(([name, fTrials], i) => {
      const scored = fTrials.map(t => t.Result === 'Excellent' ? 95 : t.Result === 'Good' ? 80 : t.Result === 'Fair' ? 60 : t.Result === 'Poor' ? 30 : 0);
      const avgE = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;
      const avgW = fTrials.filter(t => t.Temperature).reduce((a, t) => a + (parseFloat(t.Windspeed || 0) < 20 ? 90 : 60), 0) / (fTrials.length || 1);
      const avgR = fTrials.filter(t => t.Rain).reduce((a, t) => a + (parseFloat(t.Rain || 0) < 10 ? 90 : 60), 0) / (fTrials.length || 1);
      const countScore = Math.min(100, fTrials.length * 20);
      return {
        label: name.length > 18 ? name.slice(0, 18) + '…' : name,
        data: [Math.round(avgE), Math.round(avgW), Math.round(avgR), countScore, 80],
        backgroundColor: scoreColors[i],
        borderColor: borderColors[i],
        pointBackgroundColor: borderColors[i],
      };
    });
    return {
      type: 'radar',
      data: {
        labels: ['Efficacy', 'Wind Tolerance', 'Rain Resilience', 'Trial Count', 'Persistence'],
        datasets,
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 100 } }, plugins: { legend: { position: 'bottom' } } },
    };
  }, [trials]);

  // ── Result distribution ────────────────────────────────────────
  const resultDist = useMemo(() => {
    const map = { Excellent: 0, Good: 0, Fair: 0, Poor: 0, Control: 0 };
    trials.forEach(t => { if (t.Result && map[t.Result] !== undefined) map[t.Result]++; });
    return map;
  }, [trials]);

  // ── Chart configs ──────────────────────────────────────────────
  const monthlyChartConfig = {
    type: 'bar',
    data: {
      labels: Object.keys(trialsByMonth),
      datasets: [{ label: 'Trials', data: Object.values(trialsByMonth), backgroundColor: '#10b981', borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  };

  const efficacyChartConfig = efficacyByFormulation.length > 0 ? {
    type: 'bar',
    data: {
      labels: efficacyByFormulation.map(e => e.name.length > 18 ? e.name.slice(0, 18) + '…' : e.name),
      datasets: [{ label: 'Avg Final WCE %', data: efficacyByFormulation.map(e => e.avg), backgroundColor: CHART_COLORS, borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { max: 100 } } }
  } : null;

  const weedChartConfig = weedSpeciesFreq.length > 0 ? {
    type: 'doughnut',
    data: {
      labels: weedSpeciesFreq.map(([n]) => n),
      datasets: [{ data: weedSpeciesFreq.map(([, c]) => c), backgroundColor: CHART_COLORS }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
  } : null;

  const resultChartConfig = Object.values(resultDist).some(v => v > 0) ? {
    type: 'doughnut',
    data: {
      labels: Object.keys(resultDist),
      datasets: [{ data: Object.values(resultDist), backgroundColor: ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6'] }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
  } : null;

  const toggle = (s) => setExpandedSection(prev => prev === s ? null : s);

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Analytics & Stats" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4 max-w-7xl mx-auto w-full space-y-5">
        {/* Export button */}
        <div className="flex justify-end">
          <button onClick={handleExportPDF} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            <Download className="w-4 h-4" /> Export Analytics PDF
          </button>
        </div>
        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Total Trials" value={trials.length} sub={`${projects.length} projects`} color="emerald" />
          <StatTile label="Total Observations" value={summary.totalObs} sub="across all trials" color="blue" />
          <StatTile label="Success Rate" value={summary.rated > 0 ? `${summary.successRate}%` : '—'} sub={`${summary.rated} rated trials`} color="amber" />
          <StatTile label="Trials w/ Photos" value={summary.withPhotos} sub={`${summary.controlTrials} control plots`} color="purple" />
        </div>

        {/* Monthly chart */}
        <ChartCard id="monthly-chart" title="Trial Volume (Last 12 Months)" description="Trials created per month"
          config={Object.values(trialsByMonth).some(v => v > 0) ? monthlyChartConfig : null} height="260px" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard id="efficacy-chart" title="Avg Final Efficacy by Formulation"
            description="Average Weed Control Efficacy (%) at last observation"
            config={efficacyChartConfig} height="300px" />
          <ChartCard id="result-dist-chart" title="Result Distribution"
            description="How trials are rated overall"
            config={resultChartConfig} height="300px" />
        </div>

        <ChartCard id="weed-chart" title="Weed Species Frequency"
          description="Most commonly targeted weed species across all trials"
          config={weedChartConfig} height="300px" />

        {/* Performance Radar */}
        {radarChartConfig && (
          <ChartCard id="radar-chart" title="Performance Radar (Top 3 Formulations)"
            description="Comparative radar across key performance dimensions"
            config={radarChartConfig} height="320px" />
        )}

        {/* Environmental Correlation Scatter Charts */}
        {envCorrData.some(d => d.points.length > 0) && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <button onClick={() => toggle('env-corr')} className="w-full flex justify-between items-center px-5 py-4 font-bold text-slate-800 hover:bg-slate-50 transition">
              <span className="flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-600" />Environmental Correlation (Efficacy vs Weather)</span>
              {expandedSection === 'env-corr' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'env-corr' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
                {envCorrData.map(({ key, label, color, points }) =>
                  points.length > 0 ? (
                    <ChartCard
                      key={key}
                      id={`corr-chart-${key}`}
                      title={label}
                      description="Efficacy (%) vs environmental variable"
                      config={{
                        type: 'scatter',
                        data: { datasets: [{ label: label, data: points, backgroundColor: color }] },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Efficacy (%)' } }, x: { title: { display: true, text: label } } } },
                      }}
                      height="240px"
                    />
                  ) : (
                    <div key={key} className="flex items-center justify-center h-40 text-slate-400 text-xs bg-slate-50 rounded-lg border border-slate-100">No data for {label}</div>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* Efficacy table */}
        {efficacyByFormulation.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <button onClick={() => toggle('eff-table')} className="w-full flex justify-between items-center px-5 py-4 font-bold text-slate-800 hover:bg-slate-50 transition">
              <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" />Formulation Efficacy Table</span>
              {expandedSection === 'eff-table' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'eff-table' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-y border-slate-100">
                    <tr>
                      <th className="px-5 py-3 font-semibold text-slate-600">Formulation</th>
                      <th className="px-5 py-3 font-semibold text-slate-600 text-center">Trials</th>
                      <th className="px-5 py-3 font-semibold text-slate-600 text-right">Avg Final WCE</th>
                      <th className="px-5 py-3 w-40">Bar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {efficacyByFormulation.map(({ name, avg, count }, i) => (
                      <tr key={name} className="hover:bg-slate-50 transition">
                        <td className="px-5 py-3 font-medium text-slate-700">{name}</td>
                        <td className="px-5 py-3 text-center text-slate-500">{count}</td>
                        <td className="px-5 py-3 text-right font-bold text-emerald-700">{avg}%</td>
                        <td className="px-5 py-3">
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${avg}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Weed species table */}
        {weedSpeciesFreq.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <button onClick={() => toggle('weed-table')} className="w-full flex justify-between items-center px-5 py-4 font-bold text-slate-800 hover:bg-slate-50 transition">
              <span className="flex items-center gap-2"><Leaf className="w-4 h-4 text-emerald-600" />Weed Species Summary</span>
              {expandedSection === 'weed-table' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'weed-table' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-y border-slate-100">
                    <tr>
                      <th className="px-5 py-3 font-semibold text-slate-600">Species</th>
                      <th className="px-5 py-3 font-semibold text-slate-600 text-right">Occurrences</th>
                      <th className="px-5 py-3 w-40">Frequency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {weedSpeciesFreq.map(([name, count], i) => (
                      <tr key={name} className="hover:bg-slate-50 transition">
                        <td className="px-5 py-3 font-medium text-slate-700 italic">{name}</td>
                        <td className="px-5 py-3 text-right font-bold text-slate-700">{count}</td>
                        <td className="px-5 py-3">
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(count / (weedSpeciesFreq[0]?.[1] || 1)) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {trials.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-semibold">No data to analyse yet</p>
            <p className="text-sm mt-1">Create trials with observations to see analytics here</p>
          </div>
        )}
      </div>
    </div>
  );
}
