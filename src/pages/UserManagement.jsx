import React, { useState, useMemo } from 'react';
import TopBar from '../components/TopBar.jsx';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { Users, ShieldAlert, CheckCircle, XCircle, Plus, Pencil, Trash2, X, UserCog } from 'lucide-react';

const emptyForm = { username: '', password: '', role: 'user', disabled: false };

export default function UserManagement({ onMenuClick }) {
  const { isAdmin, user: currentUser } = useAuth();
  const { state, updateState } = useAppState();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');

  const toast = (msg, type = 'success') =>
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));

  const users = useMemo(() => {
    const stored = state.users || [];
    if (stored.length === 0 && currentUser) {
      return [{ id: currentUser.id || 'admin-1', username: currentUser.Username || currentUser.username || 'admin', role: 'admin', disabled: false }];
    }
    return stored;
  }, [state.users, currentUser]);

  const filtered = useMemo(() =>
    users.filter(u => !search || u.username?.toLowerCase().includes(search.toLowerCase()))
  , [users, search]);

  const openModal = (u = null) => {
    setEditingUser(u);
    setForm(u ? { username: u.username, password: '', role: u.role || 'user', disabled: !!u.disabled } : emptyForm);
    setIsModalOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.username.trim()) { toast('Username is required', 'error'); return; }
    if (!editingUser && !form.password.trim()) { toast('Password is required for new users', 'error'); return; }

    let updated;
    if (editingUser) {
      updated = users.map(u => u.id === editingUser.id
        ? { ...u, username: form.username.trim(), role: form.role, disabled: form.disabled, ...(form.password.trim() ? { password: form.password.trim() } : {}) }
        : u
      );
      toast('User updated');
    } else {
      const newUser = { id: `user-${Date.now()}`, username: form.username.trim(), password: form.password.trim(), role: form.role, disabled: false };
      updated = [...users, newUser];
      toast('User created');
    }
    updateState({ users: updated });
    setIsModalOpen(false);
  };

  const handleDelete = (id) => {
    if (currentUser && (currentUser.id === id || currentUser.username === users.find(u => u.id === id)?.username)) {
      toast('Cannot delete your own account', 'error'); return;
    }
    if (!window.confirm('Delete this user?')) return;
    updateState({ users: users.filter(u => u.id !== id) });
    toast('User deleted');
  };

  const handleToggleDisabled = (id) => {
    if (currentUser && (currentUser.id === id)) { toast('Cannot disable your own account', 'error'); return; }
    const updated = users.map(u => u.id === id ? { ...u, disabled: !u.disabled } : u);
    updateState({ users: updated });
    toast(updated.find(u => u.id === id)?.disabled ? 'User disabled' : 'User enabled');
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <TopBar title="User Management" onMenuClick={onMenuClick} />
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div className="max-w-md">
            <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h2>
            <p className="text-slate-600">You must be an administrator to view this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="User Management" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-slate-500 text-sm">Manage access, roles, and credentials for all application users.</p>
          <div className="flex gap-2 items-center">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..."
              className="text-sm border rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <button onClick={() => openModal()} className="btn-primary px-4 py-2 rounded-xl shadow flex items-center gap-2 text-sm font-semibold whitespace-nowrap">
              <Plus className="w-4 h-4" /> Add User
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">User</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Role</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? filtered.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                        {(u.username || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{u.username}</p>
                        <p className="text-xs text-slate-400 font-mono">{u.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {u.role || 'user'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {u.disabled
                      ? <span className="flex items-center gap-1 text-red-600 text-xs font-bold"><XCircle className="w-4 h-4" /> Disabled</span>
                      : <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold"><CheckCircle className="w-4 h-4" /> Active</span>
                    }
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleToggleDisabled(u.id)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition ${u.disabled ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' : 'border-amber-200 text-amber-600 hover:bg-amber-50'}`}>
                        {u.disabled ? 'Enable' : 'Disable'}
                      </button>
                      <button onClick={() => openModal(u)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(u.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4" className="text-center py-10 text-slate-400">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{search ? 'No users match your search' : 'No users found'}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <UserCog className="w-5 h-5 text-emerald-600" />
                {editingUser ? 'Edit User' : 'Add User'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Username *</label>
                <input type="text" required value={form.username} onChange={e => setForm(p => ({...p, username: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. john.doe" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{editingUser ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                <input type="password" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))}
                  required={!editingUser}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder={editingUser ? 'Leave blank to keep current' : 'Enter password'} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              {editingUser && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.disabled} onChange={e => setForm(p => ({...p, disabled: e.target.checked}))}
                    className="w-4 h-4 accent-red-500" />
                  <span className="text-sm text-slate-600">Disable this account</span>
                </label>
              )}
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                <button type="submit" className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">{editingUser ? 'Update' : 'Create User'}</button>
              </div>
            </form>
            {editingUser && (
                <div className="mt-4 pt-3 border-t">
                    <button type="button" onClick={async () => {
                        const email = prompt("Enter the user's email to send a password reset link:");
                        if (email) {
                            try {
                                const { fbResetPassword } = await import('../services/firebaseAuth.js');
                                const res = await fbResetPassword(email);
                                if (res.success) toast('Password reset email sent!', 'success');
                                else toast(res.message, 'error');
                            } catch (e) { toast('Error sending reset email', 'error'); }
                        }
                    }} className="w-full px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition">Send Password Reset Email (Firebase)</button>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
