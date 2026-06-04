import React, { useState, useMemo } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { safeJsonParse } from '../utils/helpers.js';
import { addOrganisation, deleteOrganisation } from '../services/dataLayer.js';
import { Trash2, Plus, Edit, Search, Building2, Activity, X, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDateTime } from '../utils/dateUtils.js';

export default function Organisations({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [formData, setFormData] = useState({ Name: '', Description: '' });
  const [selectedTrialIds, setSelectedTrialIds] = useState([]);
  const [expandedOrg, setExpandedOrg] = useState(null);

  const orgs = state.organisations || [];
  const trials = state.trials || [];

  const filtered = useMemo(() => {
    let list = [...orgs].sort((a, b) => String(b.ID).localeCompare(String(a.ID), undefined, { numeric: true }));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o => (o.Name || '').toLowerCase().includes(q));
    }
    return list;
  }, [orgs, search]);

  const openModal = (org = null) => {
    setEditingOrg(org);
    if (org) {
      setFormData({ Name: org.Name || '', Description: org.Description || '' });
      setSelectedTrialIds(safeJsonParse(org.TrialIDs, []));
    } else {
      setFormData({ Name: '', Description: '' });
      setSelectedTrialIds([]);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const isEdit = !!editingOrg;
    const payload = {
      ...(isEdit ? editingOrg : { ID: Date.now().toString() }),
      ...formData,
      TrialIDs: JSON.stringify(selectedTrialIds),
    };
    updateState({ organisations: isEdit ? orgs.map(o => o.ID === payload.ID ? payload : o) : [...orgs, payload] });
    setIsModalOpen(false);
    try {
      await addOrganisation(payload, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Organisation ${isEdit ? 'updated' : 'created'}`, type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save organisation', type: 'error' } }));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this organisation?')) return;
    updateState({ organisations: orgs.filter(o => o.ID !== id) });
    try {
      await deleteOrganisation({ ID: id }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Organisation deleted', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete', type: 'error' } }));
    }
  };

  const toggleTrial = (id) => setSelectedTrialIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Organisations" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b px-4 py-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search organisations..."
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
          </div>
          <button onClick={() => openModal()} className="btn-primary text-white px-4 py-2 rounded-lg flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap">
            <Plus className="w-4 h-4" />New Organisation
          </button>
        </div>

        <div className="p-4 space-y-4">
          {filtered.length > 0 ? filtered.map(org => {
            const trialIds = safeJsonParse(org.TrialIDs, []);
            const orgTrials = trialIds.map(id => trials.find(t => t.ID === id)).filter(Boolean);
            const isExpanded = expandedOrg === org.ID;
            return (
              <div key={org.ID} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0"><Building2 className="w-5 h-5" /></div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 truncate">{org.Name}</h3>
                      {org.Description && <p className="text-xs text-slate-400 truncate">{org.Description}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">{orgTrials.length} trial{orgTrials.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openModal(org)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(org.ID)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                    <button onClick={() => setExpandedOrg(isExpanded ? null : org.ID)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-3">
                    {orgTrials.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {orgTrials.map(t => {
                          const isCompleted = t.IsCompleted === true || t.IsCompleted === 'true';
                          return (
                            <div key={t.ID} className="border rounded-lg p-3 bg-slate-50 flex items-center gap-3">
                              <div className={`p-1.5 rounded-lg shrink-0 ${isCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                                <Activity className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-700 truncate">{t.FormulationName}</p>
                                <p className="text-xs text-slate-400">{t.Location || '—'} · {formatDateTime(t.Date) || '—'}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 text-center py-4">No trials assigned yet. Edit to assign trials.</p>
                    )}
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="text-center py-16 text-slate-400">
              <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-semibold">{search ? 'No organisations match your search' : 'No organisations yet'}</p>
              <p className="text-sm mt-1">Create an organisation to group related trials together</p>
              {!search && <button onClick={() => openModal()} className="mt-4 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition">Create Organisation</button>}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingOrg ? 'Edit Organisation' : 'New Organisation'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Organisation Name *</label>
            <input type="text" required value={formData.Name} onChange={e => setFormData({ ...formData, Name: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. North Region Trials" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Description</label>
            <textarea rows="2" value={formData.Description} onChange={e => setFormData({ ...formData, Description: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Assign Trials ({selectedTrialIds.length} selected)</label>
            <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
              {trials.length > 0 ? trials.map(t => (
                <label key={t.ID} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selectedTrialIds.includes(t.ID)} onChange={() => toggleTrial(t.ID)} className="w-4 h-4 accent-emerald-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{t.FormulationName || 'Unknown'}</p>
                    <p className="text-xs text-slate-400">{t.Location || '—'} · {formatDateTime(t.Date) || '—'}</p>
                  </div>
                </label>
              )) : <p className="text-sm text-slate-400 p-3 text-center">No trials available</p>}
            </div>
          </div>
          <div className="pt-3 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
            <button type="submit" className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">{editingOrg ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
