// src/pages/MigrationTool.jsx
// Google Sheets → Firebase migration wizard.
// Admin-only. Reads from Google Sheet via the legacy apiCall, then batch-writes to Firestore.

import React, { useState, useCallback } from 'react';
import TopBar from '../components/TopBar.jsx';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { apiCall } from '../services/db.js';
import { fbImportAll } from '../services/firebaseDB.js';
import { isFirebaseReady, getFirebaseAuth } from '../services/firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import {
  Database, ArrowRight, CheckCircle, XCircle, RefreshCw,
  AlertTriangle, Download, Upload, ShieldCheck
} from 'lucide-react';

const STEPS = ['preflight', 'fetch', 'review', 'migrate', 'done'];

const ENTITIES = [
  { key: 'trials', label: 'Trials', icon: '🧪' },
  { key: 'formulations', label: 'Formulations', icon: '🧬' },
  { key: 'ingredients', label: 'Ingredients', icon: '⚗️' },
  { key: 'projects', label: 'Projects', icon: '📁' },
  { key: 'blocks', label: 'Blocks', icon: '🔲' },
  { key: 'organisations', label: 'Organisations', icon: '🏢' },
];

export default function MigrationTool({ onMenuClick }) {
  const { state, getAppState } = useAppState();
  const { isAdmin } = useAuth();

  const [step, setStep] = useState('preflight');
  const [fetched, setFetched] = useState({});
  const [fetchStatus, setFetchStatus] = useState({});
  const [migrateStatus, setMigrateStatus] = useState({});
  const [overallError, setOverallError] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [fbPassword, setFbPassword] = useState('');
  const [fbAccountCreating, setFbAccountCreating] = useState(false);
  const [fbAccountMsg, setFbAccountMsg] = useState(null);

  const toast = (msg, type = 'success') =>
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));

  const s = state.settings || {};
  const firebaseReady = isFirebaseReady();
  const sheetReady = !!(s.scriptUrl && s.sheetId);

  // ─── Preflight checks ────────────────────────────────────────────────────────

  const preflightChecks = [
    {
      label: 'Admin account logged in',
      ok: isAdmin,
      fix: 'Log in with an Admin account to run migrations.',
    },
    {
      label: 'Firebase enabled & initialized',
      ok: s.firebaseEnabled && firebaseReady,
      fix: 'Enable Firebase in Settings and save your Firebase config first.',
    },
    {
      label: 'Google Sheet Script URL configured',
      ok: sheetReady,
      fix: 'Add your Google Apps Script URL and Sheet ID in Settings → Data Source.',
    },
  ];
  const preflightOk = preflightChecks.every(c => c.ok);

  // ─── Step 1: Fetch from Sheets ────────────────────────────────────────────

  // Build a getAppState wrapper that guarantees scriptUrl & sheetId are present
  // (required by apiCall even if Firebase is the primary DB in this session)
  const makeSheetGetAppState = useCallback(() => {
    return () => {
      const base = getAppState();
      const fbAuth = base.auth || {};
      // Build a legacy-style auth object so the Apps Script receives credentials
      const legacyAuth = {
        ...fbAuth,
        username: fbAuth.username || fbAuth.user?.Username || fbAuth.user?.email || '',
        password: fbAuth.password || '',
        Token: fbAuth.token || fbAuth.Token || fbAuth.username || '',
        token: fbAuth.token || fbAuth.Token || fbAuth.username || '',
        Role: fbAuth.user?.Role || fbAuth.user?.role || 'admin',
      };
      return {
        ...base,
        auth: legacyAuth,
        settings: {
          ...base.settings,
          scriptUrl: base.settings?.scriptUrl || '',
          sheetId: base.settings?.sheetId || '',
          firebaseEnabled: false, // force legacy path so apiCall doesn't short-circuit
        },
        isOnline: true,
      };
    };
  }, [getAppState]);

  const handleFetchAll = useCallback(async () => {
    setIsFetching(true);
    setOverallError('');
    const sheetGetAppState = makeSheetGetAppState();

    // Mark all as loading
    const loadingStatus = {};
    ENTITIES.forEach(e => { loadingStatus[e.key] = 'loading'; });
    setFetchStatus({ ...loadingStatus });

    try {
      // The Apps Script only exposes a single getAllData action that returns everything
      console.log('[Migration] Calling getAllData on Google Sheet...');
      const raw = await apiCall('getAllData', {}, false, sheetGetAppState);
      console.log('[Migration] getAllData raw response keys:', raw ? Object.keys(raw) : 'null/undefined');

      if (raw?._errType) {
        throw new Error(raw.message || raw._errType);
      }

      // getAllData returns: { trials:[], formulations:[], ingredients:[], projects:[], blocks:[], organisations:[] }
      // It may be nested under a 'data' key depending on unwrapResponse
      const root = raw?.trials ? raw
                 : raw?.data?.trials ? raw.data
                 : raw?.response?.trials ? raw.response
                 : raw?.payload?.trials ? raw.payload
                 : raw;

      console.log('[Migration] Parsed root keys:', root ? Object.keys(root) : 'none');

      const newFetched = {};
      const newStatus = {};
      ENTITIES.forEach(e => {
        const arr = Array.isArray(root?.[e.key]) ? root[e.key] : [];
        newFetched[e.key] = arr;
        newStatus[e.key] = 'ok';
        console.log(`[Migration] ✓ ${e.key}: ${arr.length} records`);
      });

      setFetched(newFetched);
      setFetchStatus(newStatus);
    } catch (err) {
      console.error('[Migration] getAllData failed:', err.message);
      setOverallError('Failed to fetch data from Google Sheets: ' + err.message);
      const errStatus = {};
      ENTITIES.forEach(e => { errStatus[e.key] = 'error'; });
      setFetchStatus(errStatus);
    }

    setIsFetching(false);
    setStep('review');
  }, [getAppState, makeSheetGetAppState]);

  // ─── Step 2: Migrate to Firestore ────────────────────────────────────────

  const handleMigrate = useCallback(async () => {
    setIsMigrating(true);
    setOverallError('');
    const newStatus = {};

    try {
      // ── Ensure Firebase Auth has an active session ──────────────────────────
      const fbAuth = getFirebaseAuth();
      let currentUser = fbAuth.currentUser;
      const appState = getAppState();

      if (!currentUser) {
        const email = appState.auth?.username || appState.auth?.user?.Username || appState.auth?.user?.email || '';
        const resolvedPassword = fbPassword;

        if (!email || !resolvedPassword) {
          throw new Error('Enter your Firebase email password above and try again.');
        }

        console.log('[Migration] Attempting Firebase sign-in as:', email, '| password length:', resolvedPassword.length);
        try {
          const cred = await signInWithEmailAndPassword(fbAuth, email, resolvedPassword);
          currentUser = cred.user;
          console.log('[Migration] ✓ Firebase Auth OK, UID:', currentUser.uid);
        } catch (authErr) {
          console.error('[Migration] Sign-in failed:', authErr.code, authErr.message);
          // Fallback: if auth keeps failing, try with open rules (user should have set allow all)
          throw new Error(
            `Firebase sign-in failed (${authErr.code}). ` +
            `\n\nQuickest fix: Go to Firebase Console → Firestore → Rules and temporarily set:\n` +
            `allow read, write: if true;\n` +
            `Then click Start Migration. Restore secure rules after migration completes.`
          );
        }
      } else {
        console.log('[Migration] Firebase Auth already active, UID:', currentUser.uid);
      }

      const uid = currentUser?.uid || appState.auth?.uid || 'migrated';

      // ── Run migration per entity ─────────────────────────────────────────────
      for (const entity of ENTITIES) {
        const items = fetched[entity.key] || [];
        if (!items.length) {
          newStatus[entity.key] = { status: 'skipped', count: 0 };
          setMigrateStatus({ ...newStatus });
          continue;
        }
        newStatus[entity.key] = { status: 'loading', count: 0 };
        setMigrateStatus({ ...newStatus });

        try {
          const result = await fbImportAll({ [entity.key]: items }, uid);
          newStatus[entity.key] = {
            status: 'ok',
            count: result.results?.[entity.key]?.count || items.length,
          };
          console.log(`[Migration] ✓ Wrote ${newStatus[entity.key].count} ${entity.key} to Firestore`);
        } catch (err) {
          newStatus[entity.key] = { status: 'error', count: 0, message: err.message };
          console.error('Migrate error for', entity.key, err);
        }
        setMigrateStatus({ ...newStatus });
      }
      setStep('done');
    } catch (err) {
      setOverallError(err.message);
      console.error('[Migration] Fatal error:', err);
    } finally {
      setIsMigrating(false);
    }
  }, [fetched, getAppState]);

  // ─── helpers ─────────────────────────────────────────────────────────────

  const totalFetched = Object.values(fetched).reduce((s, a) => s + (a?.length || 0), 0);
  const totalMigrated = Object.values(migrateStatus).reduce((s, m) => s + (m?.count || 0), 0);

  const StatusIcon = ({ status }) => {
    if (status === 'ok') return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    if (status === 'error') return <XCircle className="w-4 h-4 text-red-500" />;
    if (status === 'loading') return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
    if (status === 'skipped') return <span className="text-xs text-gray-400">–</span>;
    return null;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Google Sheets → Firebase Migration" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full space-y-6">

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl p-5 flex items-center gap-4">
          <Database className="w-10 h-10 flex-shrink-0 opacity-80" />
          <div>
            <h1 className="text-xl font-bold">Data Migration Wizard</h1>
            <p className="text-sm opacity-90 mt-0.5">
              Copy all your Google Sheets data into Firebase Firestore. Photos stay in Google Drive — only structured data moves.
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          {['Preflight', 'Fetch', 'Review', 'Migrate', 'Done'].map((label, i) => {
            const idx = STEPS.indexOf(step);
            const active = i === idx;
            const done = i < idx;
            return (
              <React.Fragment key={label}>
                <span className={`px-2 py-1 rounded-full ${active ? 'bg-blue-600 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100'}`}>
                  {done ? '✓' : i + 1} {label}
                </span>
                {i < 4 && <ArrowRight className="w-3 h-3" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── STEP: Preflight ── */}
        {step === 'preflight' && (
          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <h2 className="font-bold text-gray-800 text-lg">Preflight Checks</h2>
            <div className="space-y-3">
              {preflightChecks.map(c => (
                <div key={c.label} className={`flex items-start gap-3 p-3 rounded-lg ${c.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                  {c.ok
                    ? <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    : <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />}
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{c.label}</p>
                    {!c.ok && <p className="text-xs text-red-600 mt-0.5">{c.fix}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <strong>Important:</strong> Migration is non-destructive. Existing Firebase documents with the same ID will be overwritten. Your Google Sheets data is never deleted. Photos remain in Google Drive.
              </div>
            </div>

            <button
              disabled={!preflightOk}
              onClick={() => setStep('fetch')}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-5 h-5" /> Continue to Fetch Data
            </button>
          </div>
        )}

        {/* ── STEP: Fetch ── */}
        {step === 'fetch' && (
          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <h2 className="font-bold text-gray-800 text-lg">Fetch from Google Sheets</h2>
            <p className="text-sm text-gray-600">
              This reads all your data from Google Sheets using your Apps Script URL. No data is written yet.
            </p>

            <div className="space-y-2">
              {ENTITIES.map(e => (
                <div key={e.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm">
                  <span className="font-medium text-gray-700">{e.icon} {e.label}</span>
                  <div className="flex items-center gap-2">
                    {fetchStatus[e.key] && <StatusIcon status={fetchStatus[e.key]} />}
                    {fetchStatus[e.key] === 'ok' && (
                      <span className="text-xs text-emerald-700 font-semibold">{fetched[e.key]?.length || 0} records</span>
                    )}
                    {fetchStatus[e.key] === 'error' && (
                      <span className="text-xs text-red-600">Failed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              disabled={isFetching}
              onClick={handleFetchAll}
              className="w-full py-3 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {isFetching
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Fetching…</>
                : <><Download className="w-4 h-4" /> Fetch All Data from Sheets</>}
            </button>
          </div>
        )}

        {/* ── STEP: Review ── */}
        {step === 'review' && (
          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <h2 className="font-bold text-gray-800 text-lg">Review Data</h2>
            <p className="text-sm text-gray-600">
              Found <strong>{totalFetched.toLocaleString()}</strong> total records ready to migrate.
            </p>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">Entity</th>
                    <th className="text-right px-4 py-2">Records</th>
                    <th className="text-center px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ENTITIES.map(e => (
                    <tr key={e.key} className="border-t hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium">{e.icon} {e.label}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{(fetched[e.key]?.length || 0).toLocaleString()}</td>
                      <td className="px-4 py-2 text-center">
                        <StatusIcon status={fetchStatus[e.key]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('fetch')}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition text-sm"
              >
                Re-fetch
              </button>
              <button
                onClick={() => setStep('migrate')}
                disabled={totalFetched === 0}
                className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition text-sm flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" /> Proceed to Migration
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: Migrate ── */}
        {step === 'migrate' && (
          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <h2 className="font-bold text-gray-800 text-lg">Migrate to Firebase</h2>
            <p className="text-sm text-gray-600">
              Writing <strong>{totalFetched.toLocaleString()}</strong> records to Firestore. Do not close this page.
            </p>

            {/* Firebase Auth — two options */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
              <p className="text-xs font-semibold text-blue-800 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Authorize Firestore Writes
              </p>

              {/* OPTION 1 — Fastest */}
              <div className="p-3 bg-white border border-blue-200 rounded-lg space-y-1">
                <p className="text-xs font-bold text-blue-900">⚡ Option 1 — Fastest (Recommended)</p>
                <p className="text-xs text-blue-700">In Firebase Console → Firestore → Rules, set:</p>
                <pre className="text-xs bg-blue-100 rounded px-2 py-1 text-blue-900 font-mono">{'allow read, write: if true;'}</pre>
                <p className="text-xs text-blue-600">Click Publish, come back here and click Start Migration. <strong>Restore rules after.</strong></p>
              </div>

              {/* OPTION 2 — Password */}
              <div className="p-3 bg-white border border-amber-200 rounded-lg space-y-2">
                <p className="text-xs font-bold text-amber-900">🔑 Option 2 — Sign in with Firebase Password</p>
                <p className="text-xs text-amber-700">
                  Email: <strong>{getAppState().auth?.username || getAppState().auth?.user?.Username || '(not set)'}</strong>
                </p>
                <input
                  type="password"
                  value={fbPassword}
                  onChange={e => { setFbPassword(e.target.value); setFbAccountMsg(null); }}
                  placeholder="Your Firebase account password"
                  className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                />

              {/* Create account / reset password buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={fbAccountCreating || !fbPassword}
                  onClick={async () => {
                    setFbAccountCreating(true);
                    setFbAccountMsg(null);
                    try {
                      const fbAuth = getFirebaseAuth();
                      const email = getAppState().auth?.username || getAppState().auth?.user?.Username || '';
                      const cred = await createUserWithEmailAndPassword(fbAuth, email, fbPassword);
                      setFbAccountMsg({ ok: true, text: `✓ Account created! UID: ${cred.user.uid}. Now click Start Migration.` });
                    } catch (err) {
                      if (err.code === 'auth/email-already-in-use') {
                        setFbAccountMsg({ ok: null, text: 'Account already exists. If password is wrong, use "Send Reset Email" to set a new one.' });
                      } else {
                        setFbAccountMsg({ ok: false, text: err.message });
                      }
                    } finally {
                      setFbAccountCreating(false);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-400 bg-white text-amber-800 hover:bg-amber-100 disabled:opacity-40 transition"
                >
                  {fbAccountCreating ? 'Creating…' : '➕ Create Account (new)'}
                </button>

                <button
                  type="button"
                  disabled={fbAccountCreating}
                  onClick={async () => {
                    setFbAccountCreating(true);
                    setFbAccountMsg(null);
                    try {
                      const fbAuth = getFirebaseAuth();
                      const email = getAppState().auth?.username || getAppState().auth?.user?.Username || '';
                      await sendPasswordResetEmail(fbAuth, email);
                      setFbAccountMsg({ ok: true, text: `✓ Reset email sent to ${email}. Check your inbox, set a new password, then come back and enter it here.` });
                    } catch (err) {
                      setFbAccountMsg({ ok: false, text: 'Reset failed: ' + err.message });
                    } finally {
                      setFbAccountCreating(false);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-40 transition"
                >
                  📧 Send Password Reset Email
                </button>
              </div>

              {fbAccountMsg && (
                <p className={`text-xs font-semibold ${fbAccountMsg.ok === true ? 'text-emerald-700' : fbAccountMsg.ok === false ? 'text-red-600' : 'text-amber-700'}`}>
                  {fbAccountMsg.text}
                </p>
              )}
              </div>{/* end Option 2 */}
            </div>{/* end auth box */}

            <div className="space-y-2">
              {ENTITIES.map(e => {
                const ms = migrateStatus[e.key];
                return (
                  <div key={e.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm">
                    <span className="font-medium text-gray-700">{e.icon} {e.label}</span>
                    <div className="flex items-center gap-2">
                      {ms && <StatusIcon status={ms.status} />}
                      {ms?.status === 'ok' && (
                        <span className="text-xs text-emerald-700 font-semibold">{ms.count} written</span>
                      )}
                      {ms?.status === 'error' && (
                        <span className="text-xs text-red-600">{ms.message || 'Error'}</span>
                      )}
                      {ms?.status === 'skipped' && (
                        <span className="text-xs text-gray-400">No data</span>
                      )}
                      {!ms && (
                        <span className="text-xs text-gray-400">{(fetched[e.key]?.length || 0)} records queued</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {overallError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex gap-2">
                <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {overallError}
              </div>
            )}

            <button
              disabled={isMigrating}
              onClick={handleMigrate}
              className="w-full py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {isMigrating
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Migrating…</>
                : <><Upload className="w-4 h-4" /> Start Migration</>}
            </button>
          </div>
        )}

        {/* ── STEP: Done ── */}
        {step === 'done' && (
          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
              <div>
                <h2 className="font-bold text-gray-800 text-lg">Migration Complete!</h2>
                <p className="text-sm text-gray-600">{totalMigrated.toLocaleString()} records written to Firebase Firestore.</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">Entity</th>
                    <th className="text-right px-4 py-2">Records Migrated</th>
                    <th className="text-center px-4 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {ENTITIES.map(e => {
                    const ms = migrateStatus[e.key];
                    return (
                      <tr key={e.key} className="border-t">
                        <td className="px-4 py-2 font-medium">{e.icon} {e.label}</td>
                        <td className="px-4 py-2 text-right">{ms?.count || 0}</td>
                        <td className="px-4 py-2 text-center"><StatusIcon status={ms?.status || 'skipped'} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <strong>Next step:</strong> Your Google Sheets data is intact. Enable <strong>Sheet Mirror</strong> in Settings to keep Sheets as a backup going forward. You can disable it anytime.
              </div>
            </div>

            <button
              onClick={() => { setStep('preflight'); setFetched({}); setFetchStatus({}); setMigrateStatus({}); }}
              className="w-full py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition text-sm"
            >
              Run Another Migration
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
