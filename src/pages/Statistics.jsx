/**
 * Statistics Analysis Page
 * Advanced statistical analysis for RCBD trials
 * ANOVA, Tukey HSD, Dunnett's Test
 */

import { useState, useMemo, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { performANOVA, performTukeyHSD, performDunnettTest } from '../utils/statsUtils.js';
import { safeJsonParse } from '../utils/helpers.js';
import { 
  BarChart3, Calculator, ChevronDown, Download, 
  AlertCircle, CheckCircle, Info, Table2 
} from 'lucide-react';

export default function Statistics() {
  const { state } = useAppState();
  const { projects, trials } = state;
  
  const [selectedProject, setSelectedProject] = useState('');
  const [metric, setMetric] = useState('controlPct');
  const [test, setTest] = useState('anova'); // anova, tukey, dunnett
  const [alpha, setAlpha] = useState(0.05);
  const [daa, setDaa] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  // Get active project
  const activeProject = useMemo(() => {
    return projects.find(p => p.ID === selectedProject);
  }, [projects, selectedProject]);

  // Get project trials
  const projectTrials = useMemo(() => {
    if (!selectedProject) return [];
    return trials.filter(t => t.ProjectID === selectedProject);
  }, [trials, selectedProject]);

  // Available DAA values
  const availableDAAs = useMemo(() => {
    const daas = new Set();
    projectTrials.forEach(t => {
      const efficacy = safeJsonParse(t.EfficacyDataJSON, []);
      efficacy.forEach(e => {
        const d = e.daa || e.daysAfterApplication;
        if (d) daas.add(d);
      });
    });
    return [...daas].sort((a, b) => a - b);
  }, [projectTrials]);

  // Identify control treatment
  const controlTreatment = useMemo(() => {
    const formulations = [...new Set(projectTrials.map(t => t.FormulationName))];
    return formulations.find(f => 
      f?.toLowerCase().includes('control') || 
      f?.toLowerCase().includes('untreated') ||
      f?.toLowerCase().includes('check')
    ) || formulations[0];
  }, [projectTrials]);

  // Run analysis
  const runAnalysis = useCallback(() => {
    if (projectTrials.length === 0) return;
    
    setLoading(true);
    
    setTimeout(() => {
      const options = { 
        metric, 
        alpha,
        daa: daa ? parseInt(daa) : null 
      };
      
      let result;
      switch (test) {
        case 'tukey':
          result = performTukeyHSD(projectTrials, options);
          break;
        case 'dunnett':
          result = performDunnettTest(projectTrials, controlTreatment, options);
          break;
        case 'anova':
        default:
          result = performANOVA(projectTrials, options);
          break;
      }
      
      setResults(result);
      setLoading(false);
    }, 100);
  }, [projectTrials, metric, alpha, test, daa, controlTreatment]);

  // Export results as CSV
  const exportResults = useCallback(() => {
    if (!results) return;
    
    let csv = 'Statistical Analysis Results\n';
    csv += `Project: ${activeProject?.Name || 'Unknown'}\n`;
    csv += `Test: ${test.toUpperCase()}, Metric: ${metric}, Alpha: ${alpha}\n\n`;
    
    if (results.anovaTable) {
      csv += 'ANOVA Table\n';
      csv += 'Source,SS,df,MS,F,p-value\n';
      results.anovaTable.source.forEach((src, i) => {
        csv += `${src},${results.anovaTable.ss[i]?.toFixed(4) || ''},${results.anovaTable.df[i] || ''},${results.anovaTable.ms[i]?.toFixed(4) || ''},${results.anovaTable.f[i]?.toFixed(4) || ''},${results.anovaTable.p[i]?.toFixed(6) || ''}\n`;
      });
    }
    
    if (results.comparisons) {
      csv += '\nPairwise Comparisons\n';
      if (test === 'tukey') {
        csv += 'Treatment A,Treatment B,Mean A,Mean B,Difference,Significant,HSD\n';
        results.comparisons.forEach(c => {
          csv += `${c.treatmentA},${c.treatmentB},${c.meanA?.toFixed(2)},${c.meanB?.toFixed(2)},${c.difference?.toFixed(2)},${c.significant ? 'Yes' : 'No'},${c.hsd?.toFixed(2)}\n`;
        });
      } else if (test === 'dunnett') {
        csv += 'Treatment,Control,Mean Diff,% Change,Significant,DSD\n';
        results.comparisons.forEach(c => {
          csv += `${c.treatment},${c.control},${c.difference?.toFixed(2)},${c.percentChange},${c.significant ? 'Yes' : 'No'},${c.dsd?.toFixed(2)}\n`;
        });
      }
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stats_analysis_${activeProject?.Name || 'project'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, test, metric, alpha, activeProject]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-3">
          <Calculator className="w-8 h-8 text-emerald-600" />
          Statistical Analysis
        </h1>
        <p className="text-slate-600 mt-1">
          Advanced ANOVA, Tukey HSD, and Dunnett's tests for RCBD trials
        </p>
      </div>

      {/* Configuration Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Project Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Select Project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => { setSelectedProject(e.target.value); setResults(null); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            >
              <option value="">-- Choose Project --</option>
              {projects.map(p => (
                <option key={p.ID} value={p.ID}>{p.Name}</option>
              ))}
            </select>
          </div>

          {/* Statistical Test */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Statistical Test
            </label>
            <select
              value={test}
              onChange={(e) => { setTest(e.target.value); setResults(null); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            >
              <option value="anova">ANOVA (F-test)</option>
              <option value="tukey">Tukey HSD (All Pairs)</option>
              <option value="dunnett">Dunnett's Test (vs Control)</option>
            </select>
          </div>

          {/* Metric */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Metric
            </label>
            <select
              value={metric}
              onChange={(e) => { setMetric(e.target.value); setResults(null); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            >
              <option value="controlPct">Weed Control % (WCE)</option>
              <option value="weedCover">Weed Cover %</option>
              <option value="yield">Yield</option>
            </select>
          </div>

          {/* DAA Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Observation Timing (DAA)
            </label>
            <select
              value={daa}
              onChange={(e) => { setDaa(e.target.value); setResults(null); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            >
              <option value="">All Observations</option>
              {availableDAAs.map(d => (
                <option key={d} value={d}>{d} DAA</option>
              ))}
            </select>
          </div>
        </div>

        {/* Alpha Level */}
        <div className="mt-4 flex items-center gap-4">
          <label className="text-sm font-semibold text-slate-700">Significance Level (α):</label>
          <div className="flex gap-2">
            {[0.01, 0.05, 0.10].map(a => (
              <button
                key={a}
                onClick={() => { setAlpha(a); setResults(null); }}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  alpha === a 
                    ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-500' 
                    : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                }`}
              >
                {a === 0.01 ? '1%' : a === 0.05 ? '5%' : '10%'}
              </button>
            ))}
          </div>
        </div>

        {/* Run Button */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={runAnalysis}
            disabled={!selectedProject || projectTrials.length === 0 || loading}
            className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Calculator className="w-4 h-4" />
            {loading ? 'Calculating...' : 'Run Analysis'}
          </button>
          
          {results && (
            <button
              onClick={exportResults}
              className="bg-slate-100 text-slate-700 px-4 py-2.5 rounded-lg font-medium hover:bg-slate-200 transition flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Results Display */}
      {results && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-xl border-2 ${results.significant ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {results.significant ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Info className="w-5 h-5 text-slate-500" />
                )}
                <span className="font-semibold text-slate-700">Result</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {results.significant ? 'Significant' : 'Not Significant'}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                F = {results.fStatistic?.toFixed(3)}, p = {results.pValue?.toFixed(4)}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Table2 className="w-5 h-5 text-blue-500" />
                <span className="font-semibold text-slate-700">Treatments</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {results.treatments?.length || 0}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {results.blocks?.length || 0} replications per treatment
              </p>
            </div>

            {results.hsd && (
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-5 h-5 text-purple-500" />
                  <span className="font-semibold text-slate-700">Tukey HSD</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  ±{results.hsd?.toFixed(2)}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  q = {results.qCritical?.toFixed(3)}, α = {alpha}
                </p>
              </div>
            )}

            {results.dsd && (
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-5 h-5 text-orange-500" />
                  <span className="font-semibold text-slate-700">Dunnett DSD</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  ±{results.dsd?.toFixed(2)}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Control: {controlTreatment}
                </p>
              </div>
            )}
          </div>

          {/* ANOVA Table */}
          {results.anovaTable && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Table2 className="w-5 h-5 text-emerald-600" />
                  ANOVA Table
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Source</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">SS</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">df</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">MS</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">F</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">p-value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.anovaTable.source.map((src, i) => (
                      <tr key={src} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-4 py-3 font-medium text-slate-800">{src}</td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {results.anovaTable.ss[i]?.toFixed(3) || '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {results.anovaTable.df[i] || '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {results.anovaTable.ms[i]?.toFixed(3) || '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {results.anovaTable.f[i]?.toFixed(3) || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {results.anovaTable.p[i] !== null && results.anovaTable.p[i] !== undefined ? (
                            <span className={`font-semibold ${results.anovaTable.p[i] < alpha ? 'text-emerald-600' : 'text-slate-600'}`}>
                              {results.anovaTable.p[i].toFixed(4)}
                              {results.anovaTable.p[i] < alpha && ' *'}
                            </span>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Treatment Means */}
          {results.treatmentMeans && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">Treatment Means</h3>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Object.entries(results.treatmentMeans).map(([trt, mean]) => (
                    <div key={trt} className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 truncate" title={trt}>{trt}</p>
                      <p className="text-lg font-bold text-slate-800">{mean.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Pairwise Comparisons */}
          {results.comparisons && results.comparisons.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">
                  {test === 'tukey' ? 'Tukey HSD Pairwise Comparisons' : "Dunnett's Test Comparisons vs Control"}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {test === 'tukey' ? (
                        <>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Treatment A</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Treatment B</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Mean A</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Mean B</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Difference</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Treatment</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">vs Control</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Mean Diff</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">% Change</th>
                        </>
                      )}
                      <th className="px-4 py-3 text-center font-semibold text-slate-700">Significant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.comparisons.map((comp, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        {test === 'tukey' ? (
                          <>
                            <td className="px-4 py-3 font-medium text-slate-800">{comp.treatmentA}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">{comp.treatmentB}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{comp.meanA?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{comp.meanB?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{comp.difference?.toFixed(2)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 font-medium text-slate-800">{comp.treatment}</td>
                            <td className="px-4 py-3 text-slate-600">{comp.control}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{comp.difference?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{comp.percentChange}%</td>
                          </>
                        )}
                        <td className="px-4 py-3 text-center">
                          {comp.significant ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                              <CheckCircle className="w-4 h-4" /> Yes
                            </span>
                          ) : (
                            <span className="text-slate-400">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Interpretation Guide:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>Significant (p &lt; α):</strong> At least one treatment differs significantly from others</li>
                <li><strong>Tukey HSD:</strong> Compares all pairs; differences &gt; HSD are significant</li>
                <li><strong>Dunnett's:</strong> Compares each treatment to control only (more powerful than Tukey for this case)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!results && !loading && (
        <div className="bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
          <Calculator className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Ready to Analyze</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Select a project and configure your analysis parameters above, then click "Run Analysis" to perform statistical tests.
          </p>
        </div>
      )}
    </div>
  );
}
