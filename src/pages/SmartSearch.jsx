import React, { useState, useMemo, useRef } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import { useNavigate } from 'react-router-dom';
import { Search, X, Activity, FolderOpen, FlaskConical, Leaf, Filter, Building2, Clock } from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';

const TYPE_CONFIG = {
  trial:        { label: 'Trial',        icon: Activity,    color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  project:      { label: 'Project',      icon: FolderOpen,  color: 'bg-purple-100 text-purple-700',  dot: 'bg-purple-500' },
  formulation:  { label: 'Formulation',  icon: FlaskConical, color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
  ingredient:   { label: 'Ingredient',   icon: Leaf,        color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  organisation: { label: 'Organisation', icon: Building2,   color: 'bg-rose-100 text-rose-700',    dot: 'bg-rose-500' },
};

function highlight(text, query) {
  if (!query || !text) return text || '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? `<mark class="bg-yellow-200 text-yellow-900 rounded px-0.5">${part}</mark>`
      : part
  ).join('');
}

function buildIndex(state) {
  const items = [];

  (state.trials || []).forEach(t => {
    const obs = safeJsonParse(t.EfficacyDataJSON, []);
    const weedDetails = obs.flatMap(o => (o.weedDetails || []).map(w => w.species)).filter(Boolean);
    items.push({
      type: 'trial', id: t.ID,
      title: t.FormulationName || 'Unknown Trial',
      sub: [t.Location, t.Date ? new Date(t.Date).toLocaleDateString() : null, t.Result].filter(Boolean).join(' · '),
      tags: [t.FormulationName, t.Location, t.WeedSpecies, t.InvestigatorName, t.Result, t.ID, ...weedDetails,
             ...(t.WeedSpecies || '').split(',').map(s => s.trim())].filter(Boolean),
      raw: t,
    });
  });

  (state.projects || []).forEach(p => items.push({
    type: 'project', id: p.ID,
    title: p.Name || 'Unknown Project',
    sub: [p.Metric, p.TargetWeed, p.Crop, p.Location].filter(Boolean).join(' · '),
    tags: [p.Name, p.TargetWeed, p.Crop, p.Location, p.Metric].filter(Boolean),
    raw: p,
  }));

  (state.formulations || []).forEach(f => {
    const ings = safeJsonParse(f.IngredientsJSON, []).map(i => i.name).filter(Boolean);
    items.push({
      type: 'formulation', id: f.ID,
      title: f.Name || 'Unknown Formulation',
      sub: ings.length > 0 ? `Ingredients: ${ings.slice(0, 3).join(', ')}` : f.Notes || '',
      tags: [f.Name, ...ings, f.Notes].filter(Boolean),
      raw: f,
    });
  });

  (state.ingredients || []).forEach(i => items.push({
    type: 'ingredient', id: i.ID,
    title: i.Name || 'Unknown Ingredient',
    sub: [i.Unit && `Unit: ${i.Unit}`, i.Cost && `Cost: ${i.Cost}`].filter(Boolean).join(' · '),
    tags: [i.Name, i.Unit].filter(Boolean),
    raw: i,
  }));

  (state.organisations || []).forEach(o => items.push({
    type: 'organisation', id: o.ID,
    title: o.Name || 'Unknown Organisation',
    sub: o.Description || '',
    tags: [o.Name, o.Description].filter(Boolean),
    raw: o,
  }));

  return items;
}

const MAX_RECENT = 8;

export default function SmartSearch({ onMenuClick }) {
  const { state } = useAppState();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('smartSearch_recent') || '[]'); } catch { return []; }
  });
  const inputRef = useRef(null);

  const addToRecent = (q) => {
    if (!q.trim()) return;
    setRecentSearches(prev => {
      const updated = [q, ...prev.filter(s => s !== q)].slice(0, MAX_RECENT);
      localStorage.setItem('smartSearch_recent', JSON.stringify(updated));
      return updated;
    });
  };

  const index = useMemo(() => buildIndex(state), [state.trials, state.projects, state.formulations, state.ingredients, state.organisations]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return index
      .map(item => {
        const haystack = item.tags.join(' ').toLowerCase();
        const score = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
        return { ...item, score };
      })
      .filter(item => item.score > 0 && (typeFilter === 'all' || item.type === typeFilter))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }, [query, index, typeFilter]);

  const counts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return {};
    const words = q.split(/\s+/);
    const c = { trial: 0, project: 0, formulation: 0, ingredient: 0 };
    index.forEach(item => {
      const haystack = item.tags.join(' ').toLowerCase();
      if (words.some(w => haystack.includes(w))) c[item.type]++;
    });
    return c;
  }, [query, index]);

  const handleNavigate = (item) => {
    if (item.type === 'trial') {
      navigate(`/trials?focus=${item.id}`);
      return;
    }
    const routes = { trial: '/trials', project: '/projects', formulation: '/formulations', ingredient: '/ingredients', organisation: '/organisations' };
    navigate(routes[item.type] || '/');
  };

  const handleSearch = (q) => {
    setQuery(q);
    if (q.trim().length > 1) addToRecent(q.trim());
  };

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'trial', label: 'Trials' },
    { key: 'project', label: 'Projects' },
    { key: 'formulation', label: 'Formulations' },
    { key: 'ingredient', label: 'Ingredients' },
    { key: 'organisation', label: 'Organisations' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Smart Search" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto">
        {/* Search bar */}
        <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 shadow-sm">
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                ref={inputRef}
                autoFocus
                type="text"
                value={query}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search trials, projects, formulations, ingredients, weed species…"
                className="w-full pl-11 pr-10 py-3 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50"
              />
              {query && (
                <button onClick={() => { setQuery(''); setTypeFilter('all'); inputRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Type filters */}
            {query && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {FILTERS.map(f => (
                  <button key={f.key} onClick={() => setTypeFilter(f.key)}
                    className={`text-xs px-3 py-1 rounded-full font-semibold transition border ${typeFilter === f.key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}>
                    {f.label}{f.key !== 'all' && counts[f.key] !== undefined ? ` (${counts[f.key]})` : f.key === 'all' && query ? ` (${results.length + (typeFilter === 'all' ? 0 : 0)})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-4 space-y-2">
          {!query ? (
            <div className="text-center py-10 text-slate-400">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-semibold text-slate-500">Search across all your data</p>
              <p className="text-sm mt-2">Try: formulation name, weed species, location, investigator, result grade…</p>
              {recentSearches.length > 0 && (
                <div className="mt-6 max-w-md mx-auto">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />Recent Searches</p>
                    <button onClick={() => { setRecentSearches([]); localStorage.removeItem('smartSearch_recent'); }}
                      className="text-xs text-red-400 hover:text-red-600">Clear</button>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {recentSearches.map(s => (
                      <button key={s} onClick={() => handleSearch(s)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-sm text-slate-600 hover:bg-slate-50 hover:border-emerald-300 transition font-medium">
                        <Clock className="w-3 h-3 text-slate-300" />{s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                <p className="w-full text-xs text-slate-400 mb-1">Suggestions:</p>
                {['Excellent', 'Amaranthus', 'Active', 'No observations'].map(s => (
                  <button key={s} onClick={() => handleSearch(s)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-sm text-slate-600 hover:bg-slate-50 hover:border-emerald-300 transition font-medium">
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-300 mt-6">{index.length} items indexed · {(state.trials||[]).length} trials · {(state.projects||[]).length} projects · {(state.formulations||[]).length} formulations · {(state.organisations||[]).length} orgs</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-semibold">No results for "{query}"</p>
              <p className="text-sm mt-1">Try different keywords or remove filters</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400 font-semibold pb-1">{results.length} result{results.length !== 1 ? 's' : ''} for "{query}"</p>
              {results.map((item) => {
                const cfg = TYPE_CONFIG[item.type];
                const Icon = cfg.icon;
                return (
                  <button key={`${item.type}-${item.id}`} onClick={() => handleNavigate(item)}
                    className="w-full flex items-center gap-3 bg-white rounded-xl border border-slate-100 p-4 hover:shadow-md hover:border-emerald-200 transition text-left group">
                    <div className={`p-2.5 rounded-xl shrink-0 ${cfg.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 truncate"
                        dangerouslySetInnerHTML={{ __html: highlight(item.title, query.trim()) }} />
                      {item.sub && (
                        <p className="text-xs text-slate-400 truncate mt-0.5"
                          dangerouslySetInnerHTML={{ __html: highlight(item.sub, query.trim()) }} />
                      )}
                    </div>
                    <span className="text-xs text-emerald-600 font-semibold opacity-0 group-hover:opacity-100 shrink-0">View →</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}