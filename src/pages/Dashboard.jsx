import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import { useNavigate } from 'react-router-dom';
import { safeJsonParse } from '../utils/helpers.js';
import SprayAdvisor from '../components/SprayAdvisor.jsx';
import SmartAlerts from '../components/SmartAlerts.jsx';
import {
  Activity, FolderOpen, FlaskConical, CheckCircle, Plus,
  TrendingUp, AlertCircle, Leaf, BarChart3, Search, ChevronRight,
  Thermometer, Droplets, Wind, CloudRain, Sprout, Filter
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, sub, color = 'emerald', onClick }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <button onClick={onClick} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition text-left w-full">
      <div className={`p-3 rounded-xl ${colors[color]}`}><Icon className="w-5 h-5" /></div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </button>
  );
}

function MiniBar({ value, max, color = 'bg-emerald-500' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Dashboard({ onMenuClick }) {
  const { state } = useAppState();
  const { user } = useAuth();
  const navigate = useNavigate();

  const trials = state.trials || [];
  const projects = state.projects || [];
  const formulations = state.formulations || [];
  const ingredients = state.ingredients || [];

  // ── Weed-finder state
  const [weedQuery, setWeedQuery] = useState('');
  const [minEfficacy, setMinEfficacy] = useState(70);
  const [weedResults, setWeedResults] = useState(null);

  // ── Location for Spray Advisor (from most recent trial with coordinates)
  const trialLocation = useMemo(() => {
    const trialsWithCoords = trials.filter(t => t.Lat && t.Lon && !isNaN(parseFloat(t.Lat)) && !isNaN(parseFloat(t.Lon)));
    if (trialsWithCoords.length === 0) return null;
    // Get most recent trial with coordinates
    const sorted = [...trialsWithCoords].sort((a, b) => new Date(b.Date || 0) - new Date(a.Date || 0));
    return {
      lat: parseFloat(sorted[0].Lat),
      lon: parseFloat(sorted[0].Lon),
      name: sorted[0].Location || 'Trial Location'
    };
  }, [trials]);

  // ── Top-Formulations season filter state
  const [fYear, setFYear] = useState('');
  const [fWeed, setFWeed] = useState('');
  const [fLocation, setFLocation] = useState('');

  // ── Core stats
  const stats = useMemo(() => {
    const active = trials.filter(t => t.IsCompleted !== true && t.IsCompleted !== 'true');
    const finalized = trials.filter(t => t.IsCompleted === true || t.IsCompleted === 'true');
    const totalObs = trials.reduce((acc, t) => acc + safeJsonParse(t.EfficacyDataJSON, []).length, 0);
    const resultCounts = { Excellent: 0, Good: 0, Fair: 0, Poor: 0 };
    trials.forEach(t => { if (t.Result && resultCounts[t.Result] !== undefined) resultCounts[t.Result]++; });
    const positiveResults = resultCounts.Excellent + resultCounts.Good;
    const ratedTrials = Object.values(resultCounts).reduce((a, b) => a + b, 0);
    const successRate = ratedTrials > 0 ? Math.round((positiveResults / ratedTrials) * 100) : null;
    return { active: active.length, finalized: finalized.length, totalObs, successRate, resultCounts };
  }, [trials]);

  // ── Trials Over Time (last 12 months)
  const trialsOverTime = useMemo(() => {
    const months = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = 0;
    }
    trials.forEach(t => {
      const raw = t.Date || t.CreatedAt;
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (months[key] !== undefined) months[key]++;
    });
    return Object.entries(months).map(([month, count]) => ({ month: month.slice(5), count }));
  }, [trials]);

  const maxMonthCount = useMemo(() => Math.max(...trialsOverTime.map(x => x.count), 1), [trialsOverTime]);

  // ── Average Weather Conditions from trial data
  const weatherStats = useMemo(() => {
    const temps = [], hums = [], winds = [], rains = [];
    trials.forEach(t => {
      if (t.Temperature && isFinite(parseFloat(t.Temperature))) temps.push(parseFloat(t.Temperature));
      if (t.Humidity && isFinite(parseFloat(t.Humidity))) hums.push(parseFloat(t.Humidity));
      if (t.Windspeed && isFinite(parseFloat(t.Windspeed))) winds.push(parseFloat(t.Windspeed));
      if (t.Rain && isFinite(parseFloat(t.Rain))) rains.push(parseFloat(t.Rain));
    });
    const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    return {
      temp: avg(temps), hum: avg(hums), wind: avg(winds), rain: avg(rains),
      hasData: temps.length > 0 || hums.length > 0
    };
  }, [trials]);

  // ── Weather Alerts
  const weatherAlerts = useMemo(() => {
    const alerts = [];
    if (weatherStats.temp !== null && weatherStats.temp > 35) alerts.push({ type: 'warning', msg: `High avg temperature (${weatherStats.temp.toFixed(1)}°C) — may reduce herbicide efficacy` });
    if (weatherStats.hum !== null && weatherStats.hum < 30) alerts.push({ type: 'warning', msg: `Low avg humidity (${weatherStats.hum.toFixed(1)}%) — increased evaporation risk` });
    if (weatherStats.wind !== null && weatherStats.wind > 20) alerts.push({ type: 'warning', msg: `High avg wind speed (${weatherStats.wind.toFixed(1)} km/h) — drift risk` });
    if (weatherStats.rain !== null && weatherStats.rain === 0) alerts.push({ type: 'info', msg: 'No rainfall recorded — consider irrigation impact on results' });
    return alerts;
  }, [weatherStats]);

  // ── Available years for filter
  const availableYears = useMemo(() => {
    const years = new Set();
    trials.forEach(t => {
      const raw = t.Date || t.CreatedAt;
      if (!raw) return;
      const d = new Date(raw);
      if (!isNaN(d)) years.add(String(d.getFullYear()));
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [trials]);

  // ── All weed species for datalist
  const allWeedSpecies = useMemo(() => {
    const s = new Set();
    trials.forEach(t => {
      String(t.WeedSpecies || '').split(',').map(w => w.trim()).filter(Boolean).forEach(w => s.add(w));
    });
    return Array.from(s).sort();
  }, [trials]);

  // ── Top Formulations (filtered by year/weed/location)
  const topFormulationsFiltered = useMemo(() => {
    let filtered = trials;
    if (fYear) filtered = filtered.filter(t => {
      const d = new Date(t.Date || t.CreatedAt || '');
      return !isNaN(d) && String(d.getFullYear()) === fYear;
    });
    if (fWeed) filtered = filtered.filter(t => String(t.WeedSpecies || '').toLowerCase().includes(fWeed.toLowerCase()));
    if (fLocation) filtered = filtered.filter(t => String(t.Location || '').toLowerCase().includes(fLocation.toLowerCase()));

    const counts = {};
    const efficacies = {};
    filtered.forEach(t => {
      const name = t.FormulationName;
      if (!name) return;
      counts[name] = (counts[name] || 0) + 1;
      const wce = parseFloat(t.WCE || t.FinalWCE || 0);
      if (isFinite(wce) && wce > 0) {
        if (!efficacies[name]) efficacies[name] = [];
        efficacies[name].push(wce);
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => {
        const effs = efficacies[name] || [];
        const avgEff = effs.length ? Math.round(effs.reduce((a, b) => a + b, 0) / effs.length) : null;
        return { name, count, avgEff };
      });
  }, [trials, fYear, fWeed, fLocation]);

  // ── Recent Trials
  const recentTrials = useMemo(() =>
    [...trials].sort((a, b) => new Date(b.CreatedAt || b.Date || 0) - new Date(a.CreatedAt || a.Date || 0)).slice(0, 6)
  , [trials]);

  // ── Recent Projects
  const recentProjects = useMemo(() =>
    [...projects].sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0)).slice(0, 3)
  , [projects]);

  // ── Find top formulations by weed
  const handleFindByWeed = () => {
    const q = weedQuery.trim().toLowerCase();
    if (!q) return;
    const matched = trials.filter(t =>
      String(t.WeedSpecies || '').toLowerCase().includes(q)
    );
    const byFormulation = {};
    matched.forEach(t => {
      const name = t.FormulationName || 'Unknown';
      if (!byFormulation[name]) byFormulation[name] = { name, trials: [], efficacies: [] };
      byFormulation[name].trials.push(t);
      const wce = parseFloat(t.WCE || t.FinalWCE || 0);
      if (isFinite(wce) && wce > 0) byFormulation[name].efficacies.push(wce);
    });
    const ranked = Object.values(byFormulation)
      .map(g => {
        const avg = g.efficacies.length ? g.efficacies.reduce((a, b) => a + b, 0) / g.efficacies.length : 0;
        return { ...g, avgEfficacy: avg };
      })
      .filter(g => g.avgEfficacy >= minEfficacy || g.efficacies.length === 0)
      .sort((a, b) => b.avgEfficacy - a.avgEfficacy)
      .slice(0, 10);
    setWeedResults({ query: q, results: ranked, total: matched.length });
  };

  const displayName = user?.Name || user?.Username || user?.username || 'Researcher';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const RESULT_COLORS = {
    Excellent: 'text-emerald-600 bg-emerald-50',
    Good: 'text-blue-600 bg-blue-50',
    Fair: 'text-amber-600 bg-amber-50',
    Poor: 'text-red-600 bg-red-50',
  };

  const maxFormulationCount = topFormulationsFiltered[0]?.count || 1;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Dashboard" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto">
        {/* Hero */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-5 text-white">
          <p className="text-emerald-200 text-sm font-medium">{greeting},</p>
          <h1 className="text-2xl font-bold mt-0.5">{displayName}</h1>
          <p className="text-emerald-200 text-sm mt-1">
            {stats.active} active trial{stats.active !== 1 ? 's' : ''} · {stats.totalObs} total observations
            {stats.successRate !== null && ` · ${stats.successRate}% success rate`}
          </p>
        </div>

        <div className="p-4 space-y-5">

          {/* ── Stat cards ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={Activity}    label="Total Trials"   value={trials.length}        sub={`${stats.active} active`}   color="emerald" onClick={() => navigate('/trials')} />
            <StatCard icon={CheckCircle} label="Finalized"      value={stats.finalized}                                        color="blue"    onClick={() => navigate('/trials')} />
            <StatCard icon={FolderOpen}  label="Projects"       value={projects.length}                                        color="purple"  onClick={() => navigate('/projects')} />
            <StatCard icon={FlaskConical}label="Formulations"   value={formulations.length}                                    color="amber"   onClick={() => navigate('/formulations')} />
            <StatCard icon={Leaf}        label="Ingredients"    value={ingredients.length}                                     color="emerald" onClick={() => navigate('/ingredients')} />
            <StatCard icon={BarChart3}   label="Observations"   value={stats.totalObs}                                         color="blue"    onClick={() => navigate('/analytics')} />
          </div>

          {/* ── Smart Alerts ──────────────────────────────────────── */}
          <div className="max-w-2xl">
            <SmartAlerts compact={true} />
          </div>

          {/* ── Trials Over Time + Results Breakdown ───────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Trials Over Time – inline bar chart */}
            <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-800 mb-4">Trials Over Time <span className="text-xs text-slate-400 font-normal">(last 12 months)</span></h3>
              {trialsOverTime.some(x => x.count > 0) ? (
                <div className="flex items-end gap-1 h-40">
                  {trialsOverTime.map(({ month, count }) => (
                    <div key={month} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[9px] text-slate-400 hidden group-hover:block">{count}</span>
                      <div
                        className="w-full bg-emerald-400 rounded-t hover:bg-emerald-500 transition-all"
                        style={{ height: `${Math.max(4, (count / maxMonthCount) * 128)}px` }}
                        title={`${month}: ${count} trials`}
                      />
                      <span className="text-[9px] text-slate-400 rotate-0">{month}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No trial date data available</div>
              )}
            </div>

            {/* Results Breakdown */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-800 mb-4">Results Breakdown</h3>
              {(stats.resultCounts.Excellent + stats.resultCounts.Good + stats.resultCounts.Fair + stats.resultCounts.Poor) > 0 ? (
                <div className="space-y-3">
                  {[
                    ['Excellent', stats.resultCounts.Excellent, 'bg-emerald-500'],
                    ['Good',      stats.resultCounts.Good,      'bg-blue-500'],
                    ['Fair',      stats.resultCounts.Fair,      'bg-amber-500'],
                    ['Poor',      stats.resultCounts.Poor,      'bg-red-500'],
                  ].map(([label, count, barColor]) => {
                    const total = trials.length || 1;
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-600">{label}</span>
                          <span className="font-bold text-slate-700">{count} <span className="text-slate-400 font-normal">({Math.round((count/total)*100)}%)</span></span>
                        </div>
                        <MiniBar value={count} max={total} color={barColor} />
                      </div>
                    );
                  })}
                  {stats.successRate !== null && (
                    <div className="pt-2 border-t mt-3">
                      <p className="text-xs text-slate-500">Success rate (Good + Excellent): <span className="font-bold text-emerald-600">{stats.successRate}%</span></p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No rated trials yet</div>
              )}
            </div>
          </div>

          {/* ── Top Formulations This Season (with filters) ────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-emerald-600" /> Top Formulations This Season</h3>
                <p className="text-xs text-slate-400 mt-0.5">Ranked by number of trials. Filter by year, weed, or location.</p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-1 text-xs text-slate-500"><Filter className="w-3 h-3" /></div>
                <select value={fYear} onChange={e => setFYear(e.target.value)}
                  className="text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">All Years</option>
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <input value={fWeed} onChange={e => setFWeed(e.target.value)}
                  placeholder="Filter by Weed" list="dash-fweed-list"
                  className="text-xs border rounded-lg px-2 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <datalist id="dash-fweed-list">{allWeedSpecies.map(w => <option key={w} value={w} />)}</datalist>
                <input value={fLocation} onChange={e => setFLocation(e.target.value)}
                  placeholder="Filter by Location"
                  className="text-xs border rounded-lg px-2 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                {(fYear || fWeed || fLocation) && (
                  <button onClick={() => { setFYear(''); setFWeed(''); setFLocation(''); }}
                    className="text-xs text-red-500 hover:underline">Clear</button>
                )}
              </div>
            </div>
            {topFormulationsFiltered.length > 0 ? (
              <div className="space-y-2">
                {topFormulationsFiltered.map(({ name, count, avgEff }) => (
                  <div key={name} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700 truncate">{name}</span>
                        <span className="text-slate-500 shrink-0 ml-2">
                          {count} trial{count !== 1 ? 's' : ''}
                          {avgEff !== null && <span className="text-emerald-600 font-bold ml-1">· {avgEff}% WCE</span>}
                        </span>
                      </div>
                      <MiniBar value={count} max={maxFormulationCount} color="bg-emerald-400" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-sm">No formulation data{fYear || fWeed || fLocation ? ' for these filters' : ''}</div>
            )}
          </div>


          {/* ── Spray Advisor Layout Change Since Cards Removed ──────────────────────── */}
          <div className="mb-6">
              {trialLocation && (
                <SprayAdvisor 
                  lat={trialLocation.lat} 
                  lon={trialLocation.lon} 
                  locationName={trialLocation.name}
                />
              )}
          </div>

          {/* ── Top Performing Formulations by Weed ───────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Sprout className="w-4 h-4 text-emerald-600" /> Top Performing Formulations by Weed</h3>
                <p className="text-xs text-slate-400 mt-0.5">Find which formulations perform best against a specific weed species.</p>
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Weed name</label>
                  <input value={weedQuery} onChange={e => setWeedQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleFindByWeed()}
                    list="dash-weed-datalist"
                    placeholder="Select weed species..."
                    className="border rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  <datalist id="dash-weed-datalist">{allWeedSpecies.map(w => <option key={w} value={w} />)}</datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min efficacy (%)</label>
                  <input type="number" value={minEfficacy} onChange={e => setMinEfficacy(Number(e.target.value))}
                    min="0" max="100"
                    className="border rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <button onClick={handleFindByWeed}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                  <Search className="w-4 h-4" /> Find
                </button>
              </div>
            </div>

            {weedResults === null ? (
              <p className="text-sm text-slate-400 text-center py-4">Enter a weed species name and click Find to see results.</p>
            ) : weedResults.results.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No trials found for "{weedResults.query}" with ≥{minEfficacy}% efficacy.</p>
            ) : (
              <div>
                <p className="text-xs text-slate-400 mb-3">{weedResults.total} trial{weedResults.total !== 1 ? 's' : ''} matched "{weedResults.query}" — top {weedResults.results.length} formulation{weedResults.results.length !== 1 ? 's' : ''}</p>
                <div className="space-y-2">
                  {weedResults.results.map((g, i) => (
                    <div key={g.name} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition">
                      <span className="text-xs font-bold text-slate-400 w-5 text-center">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{g.name}</p>
                        <p className="text-xs text-slate-400">{g.trials.length} trial{g.trials.length !== 1 ? 's' : ''}</p>
                      </div>
                      {g.avgEfficacy > 0 ? (
                        <div className="text-right shrink-0">
                          <span className={`text-sm font-bold ${g.avgEfficacy >= 90 ? 'text-emerald-600' : g.avgEfficacy >= 70 ? 'text-blue-600' : 'text-amber-600'}`}>
                            {g.avgEfficacy.toFixed(1)}%
                          </span>
                          <p className="text-xs text-slate-400">avg WCE</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No WCE data</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
