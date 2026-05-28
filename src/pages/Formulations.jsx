import React, { useState } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addFormulation, deleteFormulation, updateFormulation } from '../services/dataLayer.js';
import { safeJsonParse } from '../utils/helpers.js';
import { Plus, X } from 'lucide-react';

export default function Formulations({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState([{ name: '', quantity: '', unit: '' }]);

  const CURRENCY_SYMBOL = '₹';

  const handleOpenModal = (form = null, duplicate = false) => {
    if (form) {
      setEditingForm(duplicate ? null : form);
      setName(duplicate ? `${form.Name} (Copy)` : form.Name);
      setNotes(form.Notes || '');
      const parsedIngs = safeJsonParse(form.IngredientsJSON, [{ name: '', quantity: '', unit: '' }]);
      setIngredients(parsedIngs.length > 0 ? parsedIngs : [{ name: '', quantity: '', unit: '' }]);
    } else {
      setEditingForm(null);
      setName('');
      setNotes('');
      setIngredients([{ name: '', quantity: '', unit: '' }]);
    }
    setIsModalOpen(true);
  };

  const handleAddIngredientRow = () => {
    setIngredients([...ingredients, { name: '', quantity: '', unit: '' }]);
  };

  const handleRemoveIngredientRow = (index) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };

  const handleIngredientChange = (index, field, value) => {
    const newIngs = [...ingredients];
    newIngs[index][field] = value;

    // Auto-fill unit if ingredient is selected from list
    if (field === 'name') {
      const selectedLibIng = state.ingredients.find(i => i.Name === value);
      if (selectedLibIng) {
        newIngs[index].unit = selectedLibIng.Unit || '';
      }
    }
    setIngredients(newIngs);
  };

  // Estimate cost based on ingredient library
  const calculateEstimatedCost = () => {
    let total = 0;
    ingredients.forEach(ing => {
      if (ing.name && ing.quantity) {
        const libIng = state.ingredients.find(i => i.Name === ing.name);
        if (libIng && parseFloat(libIng.Cost)) {
          total += parseFloat(libIng.Cost) * parseFloat(ing.quantity);
        }
      }
    });
    return total;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const cleanIngs = ingredients.filter(i => i.name.trim() !== '');
    if (cleanIngs.length === 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'At least one ingredient is required', type: 'error' } }));
      return;
    }

    const payload = {
      ID: editingForm ? editingForm.ID : Date.now().toString(),
      Name: name,
      Notes: notes,
      IngredientsJSON: JSON.stringify(cleanIngs),
      EstimatedCost: calculateEstimatedCost(),
      CreatedAt: editingForm ? editingForm.CreatedAt : new Date().toISOString()
    };

    let newForms = [...state.formulations];
    if (editingForm) {
      newForms = newForms.map(f => f.ID === payload.ID ? payload : f);
    } else {
      newForms.push(payload);
    }
    updateState({ formulations: newForms });
    setIsModalOpen(false);

    try {
      await addFormulation(payload, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Formulation saved', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save formulation', type: 'error' } }));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this formulation?')) return;

    const newForms = state.formulations.filter(f => f.ID !== id);
    updateState({ formulations: newForms });

    try {
      await deleteFormulation({ ID: id }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Formulation deleted', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete formulation', type: 'error' } }));
    }
  };

  const sortedFormulations = [...(state.formulations || [])]
    .filter(f => !searchTerm || f.Name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const aTs = new Date(a.CreatedAt || 0).getTime() || 0;
      const bTs = new Date(b.CreatedAt || 0).getTime() || 0;
      return bTs - aTs;
    });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TopBar title="Formulations" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex-grow w-full md:w-auto">
            <input
              type="search"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search formulations by name..."
              className="w-full form-input px-4 py-2 border rounded-lg"
            />
          </div>
          <div>
            <button
              onClick={() => handleOpenModal()}
              className="btn-primary px-4 py-2 rounded-lg shadow w-full md:w-auto flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New Formulation
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedFormulations.length > 0 ? (
            sortedFormulations.map(form => {
              const ings = safeJsonParse(form.IngredientsJSON, []);
              const formTrials = (state.trials || []).filter(t => t.FormulationID === form.ID || t.FormulationName === form.Name);
              const trialsCount = formTrials.length;
              const RESULT_SCORES = { Excellent: 4, Good: 3, Fair: 2, Poor: 1 };
              const ratedTrials = formTrials.filter(t => RESULT_SCORES[t.Result]);
              const avgScore = ratedTrials.length ? ratedTrials.reduce((s, t) => s + RESULT_SCORES[t.Result], 0) / ratedTrials.length : null;
              const avgLabel = avgScore !== null ? (avgScore >= 3.5 ? 'Excellent' : avgScore >= 2.5 ? 'Good' : avgScore >= 1.5 ? 'Fair' : 'Poor') : null;
              const avgLabelColor = { Excellent: 'bg-emerald-100 text-emerald-700', Good: 'bg-blue-100 text-blue-700', Fair: 'bg-amber-100 text-amber-700', Poor: 'bg-red-100 text-red-700' };
              return (
                <div key={form.ID} className="bg-white p-6 rounded-xl shadow-lg relative transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-transparent hover:border-emerald-500/50">
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={() => handleOpenModal(form, true)} className="bg-slate-200 text-slate-700 px-3 py-1 rounded-md text-sm hover:bg-slate-300">Duplicate</button>
                    <button onClick={() => handleOpenModal(form)} className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-md text-sm hover:bg-emerald-200">Edit</button>
                    <button onClick={() => handleDelete(form.ID)} className="text-red-500 hover:text-red-700 font-bold text-xl leading-none">&times;</button>
                  </div>

                  <h3 className="font-bold text-lg text-slate-800">{form.Name}</h3>

                  <div className="mt-2 text-sm text-gray-600">
                    <ul className="list-disc list-inside">
                      {ings.map((ing, i) => (
                        <li key={i}>{ing.name} ({ing.quantity} {ing.unit})</li>
                      ))}
                    </ul>
                    {form.Notes && (
                      <p className="mt-2"><strong>Notes:</strong> {form.Notes}</p>
                    )}
                  </div>

                  <p className="mt-4 font-semibold text-emerald-700">
                    Cost: {CURRENCY_SYMBOL}{parseFloat(form.EstimatedCost || 0).toFixed(2)}
                  </p>

                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {trialsCount > 0 && (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                        {trialsCount} trial{trialsCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {avgLabel && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${avgLabelColor[avgLabel]}`}>
                        Avg: {avgLabel}
                      </span>
                    )}
                    {ratedTrials.length > 0 && (
                      <span className="text-xs text-slate-400">{ratedTrials.length} rated</span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-xl shadow-md">
              {searchTerm ? `No formulations matching "${searchTerm}".` : 'No formulations found. Create your first mixture.'}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingForm && !name.includes('(Copy)') ? 'Edit Formulation' : 'New Formulation'}
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Formulation Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="e.g., Trial Mix A"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-slate-700">Ingredients</label>
              <button
                type="button"
                onClick={handleAddIngredientRow}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-1 rounded"
              >
                + Add Row
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto p-1">
              {ingredients.map((ing, index) => (
                <div key={index} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border">
                  <div className="flex-1">
                    <input
                      type="text"
                      list="ingredient-lib-list"
                      required
                      value={ing.name}
                      onChange={e => handleIngredientChange(index, 'name', e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      placeholder="Ingredient name"
                    />
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={ing.quantity}
                      onChange={e => handleIngredientChange(index, 'quantity', e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      placeholder="Qty"
                    />
                  </div>
                  <div className="w-20">
                    <input
                      type="text"
                      required
                      value={ing.unit}
                      onChange={e => handleIngredientChange(index, 'unit', e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      placeholder="Unit"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveIngredientRow(index)}
                    disabled={ingredients.length === 1}
                    className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-30"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <datalist id="ingredient-lib-list">
              {state.ingredients.map(i => <option key={i.ID} value={i.Name} />)}
            </datalist>
          </div>

          <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 flex justify-between items-center">
            <span className="text-sm font-semibold text-emerald-800">Estimated Total Cost:</span>
            <span className="font-bold text-emerald-700 text-lg">{CURRENCY_SYMBOL}{calculateEstimatedCost().toFixed(2)}</span>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="Preparation instructions, mixing order..."
              rows={3}
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-6 py-2 rounded-xl"
            >
              Save Formulation
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
