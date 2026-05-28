import React, { useState, useEffect } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addIngredient, deleteIngredient } from '../services/dataLayer.js';
import { Edit, Trash2, Plus } from 'lucide-react';

export default function Ingredients({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [formData, setFormData] = useState({ Name: '', Cost: '', Unit: '' });

  const CURRENCY_SYMBOL = '₹'; // Could be dynamic from settings

  const handleOpenModal = (ingredient = null) => {
    if (ingredient) {
      setEditingIngredient(ingredient);
      setFormData({ Name: ingredient.Name, Cost: ingredient.Cost, Unit: ingredient.Unit });
    } else {
      setEditingIngredient(null);
      setFormData({ Name: '', Cost: '', Unit: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      ID: editingIngredient ? editingIngredient.ID : Date.now().toString()
    };

    // Optimistic UI Update
    let newIngredients = [...state.ingredients];
    if (editingIngredient) {
      newIngredients = newIngredients.map(i => i.ID === payload.ID ? payload : i);
    } else {
      newIngredients.push(payload);
    }
    updateState({ ingredients: newIngredients });
    setIsModalOpen(false);

    try {
      await addIngredient(payload, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Ingredient saved successfully', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save ingredient', type: 'error' } }));
      // Optional: rollback optimistic update
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this ingredient?')) return;

    // Optimistic UI Update
    const newIngredients = state.ingredients.filter(i => i.ID !== id);
    updateState({ ingredients: newIngredients });

    try {
      await deleteIngredient({ ID: id }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Ingredient deleted', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete ingredient', type: 'error' } }));
      // Optional: rollback optimistic update
    }
  };

  const sortedIngredients = [...(state.ingredients || [])].filter(ing => ing && ing.Name)
    .sort((a, b) => String(b.ID).localeCompare(String(a.ID), undefined, { numeric: true }));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TopBar title="Ingredient Costs" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800">Ingredients Library</h2>
          <button
            onClick={() => handleOpenModal()}
            className="btn-primary px-4 py-2 rounded-xl shadow-md flex items-center gap-2"
          >
            <Plus className="w-5 h-5" /> Add Ingredient
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
          {sortedIngredients.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {sortedIngredients.map(ing => (
                <li key={ing.ID} className="p-4 hover:bg-slate-50 flex justify-between items-center transition-colors">
                  <div>
                    <p className="font-bold text-slate-800">{ing.Name}</p>
                    <p className="text-sm text-slate-500 font-medium mt-0.5">
                      {CURRENCY_SYMBOL}{parseFloat(ing.Cost || 0).toFixed(2)} / {ing.Unit}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenModal(ing)}
                      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                      title="Edit"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(ing.ID)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-12 text-center text-slate-500">
              No ingredients found. Add one to get started.
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingIngredient ? 'Edit Ingredient' : 'New Ingredient'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Ingredient Name</label>
            <input
              type="text"
              required
              value={formData.Name}
              onChange={e => setFormData({...formData, Name: e.target.value})}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="e.g., Glyphosate"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Cost ({CURRENCY_SYMBOL})</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.Cost}
                onChange={e => setFormData({...formData, Cost: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Unit</label>
              <input
                type="text"
                required
                value={formData.Unit}
                onChange={e => setFormData({...formData, Unit: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="e.g., Litre, Kg"
              />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3">
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
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
