/**
 * Weed Resistance Tracker
 * Tracks resistance shifts across seasons, locations, and biotypes
 */

import React, { useState, useMemo } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import { safeJsonParse } from '../utils/helpers.js';
import {
  AlertTriangle, ShieldAlert, CheckCircle, TrendingDown,
  TrendingUp, Leaf, MapPin, Calendar, FlaskConical,
  ChevronDown, ChevronUp, Info, Download
} from 'lucide-react';

// Resistance risk thresholds based on ED50 shift
const RESISTANCE_LEVELS = {
  SUSCEPTIBLE:  { label: 'Susceptible',       color: 'emerald', bg: 'bg-emerald-100', text: 'text-emerald-700', threshold: 0 },
  DEVELOPING:   { label: 'Developing',        color: 'amber',   bg: 'bg-amber-100',   text: 'text-amber-700',   threshold: 2 },
  MODERATE:     { label: 'Moderate Risk',     color: 'orange',  bg: 'bg-orange-100',  text: 'text-orange-700',  threshold: 5 },
  HIGH:         { label: 'High Resistance',   color: 'red',     bg: 'bg-red-100',     text: 'text-red-700',     threshold: 10 },
  CONFIRMED:    { label: 'Confirmed Resistant',color: 'red',    bg: 'bg-red-200',     text: 'text-red-800',     threshold: 20 },
};

/**
 * Classify resistance level based on % control decline over time
 */
function classifyResistance(effiDrop, yearsData) {
  if (effiDrop >= 40 && yearsData >= 2) return RESISTANCE_LEVELS.CONFIRMED;
  if (effiDrop >= 25 && yearsData >= 2) return RESISTANCE_LEVELS.HIGH;
  if (effiDrop >= 15) return RESISTANCE_LEVELS.MODERATE;
  if (effiDrop >= 8) return RESISTANCE_LEVELS.DEVELOPING;
  return RESISTANCE_LEVELS.SUSCEPTIBLE;
}

/**
 * Get final efficacy from a trial's EfficacyDataJSON
 */
function getFinalEfficacy(trial) {
  try {
    const obs = JSON.parse(trial.EfficacyDataJSON || '[]');
    if (!obs.length) return null;
    const lastObs = obs.filter(o => o.daa > 0).sort((a, b) => b.daa - a.daa)[0];
    if (!lastObs) return null;
    if (lastObs.controlPct !== undefined) return parseFloat(lastObs.controlPct);
    const base = obs[0]?.weedCover;
    if (base > 0) return Math.max(0, ((base - parseFloat(lastObs.weedCover || 0)) / base) * 100);
    return null;
  } catch { return null; }
}

export default function ResistanceTracker({ onMenuClick }) {
  const { state } = useAppState();
  const trials = state.trials || [];

  const [selectedWeed, setSelectedWeed] = useState('');
  const [selectedFormulation, setSelectedFormulation] = useState('');
  const [expandedBiotype, setExpandedBiotype] = useState(null);
  const [sortBy, setSortBy] = useState('risk'); // risk, weed, location

  const weedSpecies = useMemo(() => [...new Set(trials.map(t => t.WeedSpecies).filter(Boolean))].sort(), [trials]);
  const formulationNames = useMemo(() => [...new Set(trials.map(t => t.FormulationName).filter(Boolean))].sort(), [trials]);

  // ── Build resistance profiles ─────────────────────────────────────────────
  const resistanceProfiles = useMemo(() => {
    const profiles = {};

    trials.forEach(trial => {
      if (!trial.WeedSpecies || !trial.FormulationName) return;
      if (selectedWeed && trial.WeedSpecies !== selectedWeed) return;
      if (selectedFormulation && trial.FormulationName !== selectedFormulation) return;

      const efficacy = getFinalEfficacy(trial);
      if (efficacy === null) return;

      const year = trial.Date ? new Date(trial.Date).getFullYear() : null;
      const location = trial.Location || 'Unknown';
      const key = `${trial.WeedSpecies}||${trial.FormulationName}||${location}`;

      if (!profiles[key]) {
        profiles[key] = {
          weed: trial.WeedSpecies,
          formulation: trial.FormulationName,
          location,
          yearlyData: {},
          trials: []
        };
      }

      if (year) {
        if (!profiles[key].yearlyData[year]) profiles[key].yearlyData[year] = [];
        profiles[key].yearlyData[year].push(efficacy);
      }

      profiles[key].trials.push({ ...trial, _efficacy: efficacy });
    });

    // Calculate trends and risk for each profile
    return Object.values(profiles).map(profile => {
      const years = Object.keys(profile.yearlyData).map(Number).sort();
      const yearlyAvg = years.map(y => ({
        year: y,
        avg: profile.yearlyData[y].reduce((a, b) => a + b, 0) / profile.yearlyData[y].length,
        n: profile.yearlyData[y].length
      }));

      let effiDrop = 0;
      let trend = 'stable';
      if (yearlyAvg.length >= 2) {
        const first = yearlyAvg[0].avg;
        const last = yearlyAvg[yearlyAvg.length - 1].avg;
        effiDrop = first - last;
        if (effiDrop > 8) trend = 'declining';
        else if (effiDrop < -5) trend = 'improving';
        else trend = 'stable';
      }

      const overallAvg = profile.trials.reduce((a, t) => a + t._efficacy, 0) / profile.trials.length;
      const level = classifyResistance(effiDrop, years.length);

      // MoA (mechanism of action) — parse from formulation notes if available
      const formulation = (state.formulations || []).find(f => f.Name === profile.formulation);
      const moa = formulation?.Notes?.match(/MoA[:\s]+([A-Z0-9/]+)/i)?.[1] || null;

      return {
        ...profile,
        yearlyAvg,
        effiDrop: Math.round(effiDrop * 10) / 10,
        trend,
        overallAvg: Math.round(overallAvg * 10) / 10,
        level,
        moa,
        riskScore: effiDrop > 0 ? effiDrop : 0
      };
    }).sort((a, b) => {
      if (sortBy === 'risk') return b.riskScore - a.riskScore;
      if (sortBy === 'weed') return a.weed.localeCompare(b.weed);
      if (sortBy === 'location') return a.location.localeCompare(b.location);
      return 0;
    });
  }, [trials, selectedWeed, selectedFormulation, sortBy, state.formulations]);

  // Summary stats
  const summary = useMemo(() => {
    const confirmed = resistanceProfiles.filter(p => p.level === RESISTANCE_LEVELS.CONFIRMED).length;
    const high = resistanceProfiles.filter(p => p.level === RESISTANCE_LEVELS.HIGH).length;
    const developing = resistanceProfiles.filter(p => p.level === RESISTANCE_LEVELS.DEVELOPING || p.level === RESISTANCE_LEVELS.MODERATE).length;
    const susceptible = resistanceProfiles.filter(p => p.level === RESISTANCE_LEVELS.SUSCEPTIBLE).length;
    const uniqueWeeds = new Set(resistanceProfiles.map(p => p.weed)).size;
    const uniqueLocations = new Set(resistanceProfiles.map(p => p.location)).size;
    return { confirmed, high, developing, susceptible, uniqueWeeds, uniqueLocations };
  }, [resistanceProfiles]);

  const handleExportCSV = () => {
    const rows = [
      ['Weed Species', 'Formulation', 'Location', 'Resistance Level', 'Efficacy Drop (%)', 'Overall Avg (%)', 'Trend', 'Years Monitored', 'MoA'],
      ...resistanceProfiles.map(p => [
        p.weed, p.formulation, p.location, p.level.label,
        p.effiDrop, p.overallAvg, p.trend, p.yearlyAvg.length, p.moa || '–'
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'weed-resistance-tracker.csv';
    a.click();
  };

  const TrendIcon = ({ trend }) => {
    if (trend === 'declining') return <TrendingDown className="w-4 h-4 text-red-500" />;
    if (trend === 'improving') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
    return <span className="text-slate-400 text-xs font-medium">—</span>;
  };

  const INPUT = 'px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Weed Resistance Tracker" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full space-y-5">

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: 'Confirmed', value: summary.confirmed, bg: 'bg-red-50', text: 'text-red-700', icon: ShieldAlert },
            { label: 'High Risk', value: summary.high, bg: 'bg-orange-50', text: 'text-orange-700', icon: AlertTriangle },
            { label: 'Developing', value: summary.developing, bg: 'bg-amber-50', text: 'text-amber-700', icon: TrendingDown },
            { label: 'Susceptible', value: summary.susceptible, bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle },
            { label: 'Weed Species', value: summary.uniqueWeeds, bg: 'bg-blue-50', text: 'text-blue-700', icon: Leaf },
            { label: 'Locations', value: summary.uniqueLocations, bg: 'bg-purple-50', text: 'text-purple-700', icon: MapPin },
          ].map(card => (
            <div key={card.label} className={`${card.bg} rounded-xl p-3 flex flex-col items-center`}>
              <card.icon className={`w-5 h-5 ${card.text} mb-1`} />
              <p className={`text-2xl font-bold ${card.text}`}>{card.value}</p>
              <p className={`text-xs font-semibold ${card.text} opacity-70`}>{card.label}</p>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Weed Species</label>
            <select value={selectedWeed} onChange={e => setSelectedWeed(e.target.value)} className={INPUT}>
              <option value="">All species</option>
              {weedSpecies.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Formulation</label>
            <select value={selectedFormulation} onChange={e => setSelectedFormulation(e.target.value)} className={INPUT}>
              <option value="">All formulations</option>
              {formulationNames.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Sort by</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={INPUT}>
              <option value="risk">Highest Risk First</option>
              <option value="weed">Weed Species (A-Z)</option>
              <option value="location">Location (A-Z)</option>
            </select>
          </div>
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition border border-blue-200 ml-auto">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>

        {/* ── Resistance profiles ── */}
        {resistanceProfiles.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center">
            <Leaf className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No resistance data yet</p>
            <p className="text-sm text-slate-400 mt-1">Add trials with efficacy observations across multiple years and locations to detect resistance trends.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {resistanceProfiles.map((profile, i) => {
              const key = `${profile.weed}||${profile.formulation}||${profile.location}`;
              const isExpanded = expandedBiotype === key;

              return (
                <div key={key} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <button
                    onClick={() => setExpandedBiotype(isExpanded ? null : key)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition text-left"
                  >
                    {/* Risk badge */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${profile.level.bg} ${profile.level.text} shrink-0`}>
                      {profile.level === RESISTANCE_LEVELS.CONFIRMED || profile.level === RESISTANCE_LEVELS.HIGH
                        ? <ShieldAlert className="w-3.5 h-3.5" />
                        : profile.level === RESISTANCE_LEVELS.MODERATE || profile.level === RESISTANCE_LEVELS.DEVELOPING
                          ? <AlertTriangle className="w-3.5 h-3.5" />
                          : <CheckCircle className="w-3.5 h-3.5" />
                      }
                      {profile.level.label}
                    </span>

                    {/* Weed + formulation */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">
                        <span className="italic">{profile.weed}</span>
                        <span className="text-slate-400 font-normal mx-1.5">×</span>
                        {profile.formulation}
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <MapPin className="w-3 h-3" />{profile.location}
                        <span className="text-slate-300">|</span>
                        <Calendar className="w-3 h-3" />{profile.yearlyAvg.length} yr{profile.yearlyAvg.length !== 1 ? 's' : ''} data
                        {profile.moa && <><span className="text-slate-300">|</span> MoA: {profile.moa}</>}
                      </p>
                    </div>

                    {/* Metrics */}
                    <div className="hidden sm:flex items-center gap-6 shrink-0 text-sm">
                      <div className="text-center">
                        <p className="font-bold text-slate-800">{profile.overallAvg}%</p>
                        <p className="text-xs text-slate-400">Avg Control</p>
                      </div>
                      <div className="text-center">
                        <p className={`font-bold ${profile.effiDrop > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {profile.effiDrop > 0 ? '−' : '+'}{Math.abs(profile.effiDrop)}%
                        </p>
                        <p className="text-xs text-slate-400">Efficacy Shift</p>
                      </div>
                      <TrendIcon trend={profile.trend} />
                    </div>

                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50/50">

                      {/* Year-over-year chart */}
                      {profile.yearlyAvg.length >= 2 && (
                        <div>
                          <p className="text-xs font-bold text-slate-600 mb-2">Year-over-Year Efficacy Trend</p>
                          <div className="flex items-end gap-2 h-24">
                            {profile.yearlyAvg.map(({ year, avg, n }) => (
                              <div key={year} className="flex flex-col items-center gap-1 flex-1">
                                <p className="text-xs font-bold text-slate-700">{avg.toFixed(0)}%</p>
                                <div
                                  className={`w-full rounded-t-md transition-all ${avg >= 80 ? 'bg-emerald-400' : avg >= 60 ? 'bg-amber-400' : avg >= 40 ? 'bg-orange-400' : 'bg-red-400'}`}
                                  style={{ height: `${(avg / 100) * 72}px` }}
                                />
                                <p className="text-xs text-slate-500">{year}</p>
                                <p className="text-[10px] text-slate-400">n={n}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Individual trials */}
                      <div>
                        <p className="text-xs font-bold text-slate-600 mb-2">Contributing Trials ({profile.trials.length})</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {profile.trials.map(t => (
                            <div key={t.ID} className="bg-white rounded-lg border border-slate-200 px-3 py-2 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="font-medium text-slate-700 truncate">{t.ID?.slice(0, 8)}…</span>
                                <span className={`font-bold ${t._efficacy >= 80 ? 'text-emerald-600' : t._efficacy >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {t._efficacy?.toFixed(1)}%
                                </span>
                              </div>
                              <p className="text-slate-400 mt-0.5">{t.Date} · {t.Location || '–'} · {t.Dosage ? t.Dosage + ' g/ha' : '–'}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Recommendations */}
                      <div className={`rounded-lg p-3 text-sm ${
                        profile.level === RESISTANCE_LEVELS.CONFIRMED ? 'bg-red-50 text-red-800' :
                        profile.level === RESISTANCE_LEVELS.HIGH ? 'bg-orange-50 text-orange-800' :
                        profile.level === RESISTANCE_LEVELS.MODERATE ? 'bg-amber-50 text-amber-800' :
                        'bg-emerald-50 text-emerald-800'
                      }`}>
                        <p className="font-bold mb-1">Recommendation</p>
                        {profile.level === RESISTANCE_LEVELS.CONFIRMED && (
                          <p>Confirmed resistance. Discontinue {profile.formulation} for {profile.weed} at this location. Switch to a different Mode of Action. Consider integrated weed management (IWM) including tillage, crop rotation, and seed bank depletion.</p>
                        )}
                        {profile.level === RESISTANCE_LEVELS.HIGH && (
                          <p>High resistance risk. Consider rotating to an alternative MoA herbicide. Increase monitoring frequency. Implement tank-mixing with a different MoA.</p>
                        )}
                        {profile.level === RESISTANCE_LEVELS.MODERATE && (
                          <p>Moderate risk — efficacy declining. Avoid repeated use. Implement MoA rotation and monitor closely next season.</p>
                        )}
                        {profile.level === RESISTANCE_LEVELS.DEVELOPING && (
                          <p>Early warning signs. Maintain label rates, avoid sub-lethal doses, and plan MoA rotation for next season.</p>
                        )}
                        {profile.level === RESISTANCE_LEVELS.SUSCEPTIBLE && (
                          <p>Currently susceptible. Continue monitoring — maintain good resistance management practices.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── About box ── */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 space-y-1">
              <p><strong>How resistance is detected:</strong> The tracker compares the average weed control efficacy of the same herbicide on the same weed species across years and locations.</p>
              <p><strong>Efficacy Drop:</strong> Difference between earliest and most recent year's average control %. A drop of &gt;8% triggers a Developing risk flag.</p>
              <p><strong>For accurate tracking:</strong> Ensure trials are recorded with consistent weed species names, formulation names, and GPS location data.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
