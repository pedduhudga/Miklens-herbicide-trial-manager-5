import React, { useState } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { initFirebase } from '../services/firebase.js';
import { Settings, Flame, Database } from 'lucide-react';

export default function Setup({ onComplete }) {
  const { updateSettings } = useAppState();
  const [mode, setMode] = useState('firebase'); // 'firebase' | 'sheets'

  // Firebase fields
  const [fbApiKey, setFbApiKey] = useState('');
  const [fbAuthDomain, setFbAuthDomain] = useState('');
  const [fbProjectId, setFbProjectId] = useState('');
  const [fbStorageBucket, setFbStorageBucket] = useState('');
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState('');
  const [fbAppId, setFbAppId] = useState('');

  // Sheets fields
  const [scriptUrl, setScriptUrl] = useState('');
  const [sheetId, setSheetId] = useState('');

  // Common
  const [folderId, setFolderId] = useState('');
  const [error, setError] = useState('');

  // SDK paste autofill
  const [sdkPaste, setSdkPaste] = useState('');
  const [pasteSuccess, setPasteSuccess] = useState(false);

  const handleSdkPaste = (text) => {
    setSdkPaste(text);
    setPasteSuccess(false);
    try {
      const extract = (key) => {
        const m = text.match(new RegExp(`["']?${key}["']?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
        return m ? m[1].trim() : '';
      };
      const apiKey   = extract('apiKey');
      const authDomain = extract('authDomain');
      const projectId = extract('projectId');
      const storageBucket = extract('storageBucket');
      const messagingSenderId = extract('messagingSenderId');
      const appId    = extract('appId');
      if (apiKey || projectId) {
        if (apiKey)            setFbApiKey(apiKey);
        if (authDomain)        setFbAuthDomain(authDomain);
        if (projectId)         setFbProjectId(projectId);
        if (storageBucket)     setFbStorageBucket(storageBucket);
        if (messagingSenderId) setFbMessagingSenderId(messagingSenderId);
        if (appId)             setFbAppId(appId);
        setMode('firebase');
        setPasteSuccess(true);
        setSdkPaste('');
      }
    } catch (_) {}
  };

  const handleSetupSave = (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'firebase') {
      if (!fbApiKey.trim() || !fbProjectId.trim()) {
        setError('Firebase API Key and Project ID are required.');
        return;
      }
      const firebaseConfig = {
        apiKey: fbApiKey.trim(),
        authDomain: fbAuthDomain.trim() || `${fbProjectId.trim()}.firebaseapp.com`,
        projectId: fbProjectId.trim(),
        storageBucket: fbStorageBucket.trim() || `${fbProjectId.trim()}.appspot.com`,
        messagingSenderId: fbMessagingSenderId.trim(),
        appId: fbAppId.trim(),
      };
      try {
        initFirebase(firebaseConfig);
      } catch (err) {
        setError('Firebase init error: ' + err.message);
        return;
      }
      updateSettings({
        firebaseEnabled: true,
        firebaseConfig,
        folderId: folderId.trim(),
      });
    } else {
      if (!scriptUrl.trim() || !sheetId.trim() || !folderId.trim()) {
        setError('All fields are required for Google Sheets mode.');
        return;
      }
      updateSettings({
        firebaseEnabled: false,
        scriptUrl: scriptUrl.replace(/\s/g, ''),
        sheetId: sheetId.trim(),
        folderId: folderId.trim(),
      });
    }
    if (onComplete) onComplete();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-700 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg mx-auto my-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Settings className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">First-Time Setup</h1>
          <p className="text-slate-500 text-sm mt-1">Choose your database backend to get started.</p>
        </div>

        {/* ── SDK Paste Autofill ── */}
        <div className="mb-5">
          <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
            ⚡ Quick Fill — Paste Firebase SDK Config
          </label>
          <textarea
            rows={3}
            value={sdkPaste}
            onChange={e => handleSdkPaste(e.target.value)}
            placeholder={`Paste your Firebase SDK config here, e.g.:\nconst firebaseConfig = { apiKey: "...", projectId: "...", ... }`}
            className="w-full px-3 py-2 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400 text-xs font-mono text-slate-700 resize-none placeholder-slate-400"
          />
          {pasteSuccess && (
            <p className="text-emerald-600 text-xs font-semibold mt-1.5 flex items-center gap-1">
              ✅ All fields filled from SDK config!
            </p>
          )}
          <p className="text-slate-400 text-xs mt-1">
            Copy the config from <strong>Firebase Console → Project Settings → Web app</strong> and paste above — fields fill automatically.
          </p>
        </div>

        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setMode('firebase')}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition font-semibold text-sm ${mode === 'firebase' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500 hover:border-orange-200'}`}
          >
            <Flame className="w-6 h-6" />
            Firebase (Recommended)
            <span className="text-xs font-normal text-center opacity-75">Real-time, scalable, secure</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('sheets')}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition font-semibold text-sm ${mode === 'sheets' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-emerald-200'}`}
          >
            <Database className="w-6 h-6" />
            Google Sheets (Legacy)
            <span className="text-xs font-normal text-center opacity-75">Existing setup, no Firebase</span>
          </button>
        </div>

        <form onSubmit={handleSetupSave} className="space-y-4">
          {mode === 'firebase' && (
            <>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: 'API Key *', val: fbApiKey, set: setFbApiKey, ph: 'AIza...', pw: true },
                  { label: 'Project ID *', val: fbProjectId, set: setFbProjectId, ph: 'your-project-id' },
                  { label: 'Auth Domain', val: fbAuthDomain, set: setFbAuthDomain, ph: 'your-project.firebaseapp.com' },
                  { label: 'Storage Bucket', val: fbStorageBucket, set: setFbStorageBucket, ph: 'your-project.appspot.com' },
                  { label: 'Messaging Sender ID', val: fbMessagingSenderId, set: setFbMessagingSenderId, ph: '123456789' },
                  { label: 'App ID', val: fbAppId, set: setFbAppId, ph: '1:123:web:abc' },
                ].map(({ label, val, set, ph, pw }) => (
                  <div key={label}>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
                    <input
                      type={pw ? 'password' : 'text'}
                      value={val}
                      onChange={e => set(e.target.value)}
                      placeholder={ph}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white text-sm"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                Get these values from <strong>Firebase Console → Project Settings → Your apps → Web app</strong>
              </p>
            </>
          )}

          {mode === 'sheets' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Google Apps Script URL *</label>
                <input type="url" value={scriptUrl} onChange={e => setScriptUrl(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white text-sm"
                  placeholder="https://script.google.com/macros/s/.../exec" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Google Sheet ID *</label>
                <input type="text" value={sheetId} onChange={e => setSheetId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white text-sm"
                  placeholder="1aBcDeFgHiJk..." />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Google Drive Folder ID (for photos) *</label>
            <input type="text" value={folderId} onChange={e => setFolderId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white text-sm"
              placeholder="1xYzAbC..." />
            <p className="text-xs text-slate-400 mt-1">Photos always upload to Google Drive regardless of database mode.</p>
          </div>

          {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}

          <button type="submit"
            className={`w-full py-3 rounded-xl text-white font-semibold text-sm shadow-lg transition ${mode === 'firebase' ? 'bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700' : 'bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800'}`}>
            Save &amp; Continue to Login
          </button>
        </form>
      </div>
    </div>
  );
}
