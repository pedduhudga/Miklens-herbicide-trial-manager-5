/**
 * Cloud Backup Component
 * UI for managing backups to Google Drive and Dropbox
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { 
  BACKUP_PROVIDERS, 
  BACKUP_TYPES,
  isSignedInGoogle,
  signInGoogle,
  signOutGoogle,
  backupToGoogleDrive,
  listGoogleDriveBackups,
  downloadFromGoogleDrive,
  deleteFromGoogleDrive,
  isDropboxAuthenticated,
  signOutDropbox,
  backupToDropbox,
  listDropboxBackups,
  downloadFromDropbox,
  deleteFromDropbox,
  prepareBackupData,
  generateBackupFilename,
  downloadLocalBackup,
  restoreFromBackup
} from '../services/cloudBackup.js';
import { 
  Cloud, CloudOff, Download, Upload, Trash2, 
  CheckCircle, AlertTriangle, RefreshCw, HardDrive,
  Database, FileJson
} from 'lucide-react';

export default function CloudBackup({ onClose }) {
  const { state, updateState } = useAppState();
  
  const [activeTab, setActiveTab] = useState('backup'); // backup, restore, settings
  const [selectedProvider, setSelectedProvider] = useState(BACKUP_PROVIDERS.LOCAL_FILE);
  const [backupType, setBackupType] = useState(BACKUP_TYPES.FULL);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [backups, setBackups] = useState([]);
  const [isSignedIn, setIsSignedIn] = useState({
    google: isSignedInGoogle(),
    dropbox: isDropboxAuthenticated()
  });

  // Check auth status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSignedIn({
        google: isSignedInGoogle(),
        dropbox: isDropboxAuthenticated()
      });
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  // Load backups when switching to restore tab
  useEffect(() => {
    if (activeTab === 'restore') {
      loadBackups();
    }
  }, [activeTab, selectedProvider, isSignedIn]);

  const loadBackups = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);
    
    try {
      let backupList = [];
      
      if (selectedProvider === BACKUP_PROVIDERS.GOOGLE_DRIVE && isSignedIn.google) {
        backupList = await listGoogleDriveBackups();
      } else if (selectedProvider === BACKUP_PROVIDERS.DROPBOX && isSignedIn.dropbox) {
        backupList = await listDropboxBackups();
      }
      
      setBackups(backupList);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [selectedProvider, isSignedIn]);

  const handleSignIn = async (provider) => {
    setIsLoading(true);
    
    try {
      if (provider === BACKUP_PROVIDERS.GOOGLE_DRIVE) {
        await signInGoogle();
        setIsSignedIn(prev => ({ ...prev, google: true }));
        setMessage({ type: 'success', text: 'Signed in to Google Drive' });
      }
      // Dropbox uses redirect flow, handled separately
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async (provider) => {
    if (provider === BACKUP_PROVIDERS.GOOGLE_DRIVE) {
      await signOutGoogle();
      setIsSignedIn(prev => ({ ...prev, google: false }));
    } else if (provider === BACKUP_PROVIDERS.DROPBOX) {
      signOutDropbox();
      setIsSignedIn(prev => ({ ...prev, dropbox: false }));
    }
    
    setMessage({ type: 'info', text: 'Signed out' });
  };

  const handleBackup = async () => {
    setIsLoading(true);
    setMessage({ type: 'info', text: 'Creating backup...' });
    
    try {
      const data = prepareBackupData(state, backupType);
      const filename = generateBackupFilename(backupType);
      
      switch (selectedProvider) {
        case BACKUP_PROVIDERS.GOOGLE_DRIVE:
          if (!isSignedIn.google) {
            throw new Error('Please sign in to Google Drive first');
          }
          await backupToGoogleDrive(data, filename);
          setMessage({ type: 'success', text: 'Backup saved to Google Drive' });
          break;
          
        case BACKUP_PROVIDERS.DROPBOX:
          if (!isSignedIn.dropbox) {
            throw new Error('Please sign in to Dropbox first');
          }
          await backupToDropbox(data, filename);
          setMessage({ type: 'success', text: 'Backup saved to Dropbox' });
          break;
          
        case BACKUP_PROVIDERS.LOCAL_FILE:
          downloadLocalBackup(data, filename);
          setMessage({ type: 'success', text: 'Backup downloaded' });
          break;
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (backup) => {
    if (!window.confirm('This will merge the backup data with your current data. Continue?')) {
      return;
    }
    
    setIsLoading(true);
    setMessage({ type: 'info', text: 'Restoring backup...' });
    
    try {
      let backupData;
      
      if (selectedProvider === BACKUP_PROVIDERS.GOOGLE_DRIVE) {
        backupData = await downloadFromGoogleDrive(backup.id);
      } else if (selectedProvider === BACKUP_PROVIDERS.DROPBOX) {
        backupData = await downloadFromDropbox(backup.path_lower || backup.path_display);
      }
      
      const restoredState = restoreFromBackup(backupData, state);
      updateState(restoredState);
      
      setMessage({ type: 'success', text: 'Backup restored successfully' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (backup) => {
    if (!window.confirm('Delete this backup? This cannot be undone.')) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      if (selectedProvider === BACKUP_PROVIDERS.GOOGLE_DRIVE) {
        await deleteFromGoogleDrive(backup.id);
      } else if (selectedProvider === BACKUP_PROVIDERS.DROPBOX) {
        await deleteFromDropbox(backup.path_lower || backup.path_display);
      }
      
      setMessage({ type: 'success', text: 'Backup deleted' });
      await loadBackups();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileRestore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsLoading(true);
    
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);
      const restoredState = restoreFromBackup(backupData, state);
      updateState(restoredState);
      
      setMessage({ type: 'success', text: 'Backup restored from file' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Invalid backup file' });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cloud className="w-6 h-6" />
            <h3 className="font-bold text-lg">Cloud Backup</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {[
            { id: 'backup', label: 'Backup', icon: Upload },
            { id: 'restore', label: 'Restore', icon: Download },
            { id: 'settings', label: 'Settings', icon: Database }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-4 mt-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
            message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {message.type === 'error' ? <AlertTriangle className="w-4 h-4" /> :
             message.type === 'success' ? <CheckCircle className="w-4 h-4" /> :
             <RefreshCw className="w-4 h-4 animate-spin" />}
            {message.text}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Provider Selection */}
          <div className="mb-4">
            <label className="text-sm font-medium text-slate-700 mb-2 block">Backup Provider</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: BACKUP_PROVIDERS.LOCAL_FILE, label: 'Local File', icon: HardDrive },
                { id: BACKUP_PROVIDERS.GOOGLE_DRIVE, label: 'Google Drive', icon: () => <span className="font-bold text-xs">G</span> },
                { id: BACKUP_PROVIDERS.DROPBOX, label: 'Dropbox', icon: Cloud }
              ].map(provider => (
                <button
                  key={provider.id}
                  onClick={() => setSelectedProvider(provider.id)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition ${
                    selectedProvider === provider.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  <provider.icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{provider.label}</span>
                  {provider.id === BACKUP_PROVIDERS.GOOGLE_DRIVE && isSignedIn.google && (
                    <span className="text-[10px] text-emerald-600 font-bold">● Connected</span>
                  )}
                  {provider.id === BACKUP_PROVIDERS.DROPBOX && isSignedIn.dropbox && (
                    <span className="text-[10px] text-emerald-600 font-bold">● Connected</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Backup Tab */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Backup Type</label>
                <select
                  value={backupType}
                  onChange={(e) => setBackupType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value={BACKUP_TYPES.FULL}>Full Backup (All Data)</option>
                  <option value={BACKUP_TYPES.TRIALS}>Trials & Observations Only</option>
                  <option value={BACKUP_TYPES.PROJECTS}>Projects & Blocks Only</option>
                </select>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600">
                <p className="font-medium text-slate-700 mb-1">What will be backed up:</p>
                <ul className="space-y-1 ml-4 list-disc">
                  {backupType === BACKUP_TYPES.FULL && (
                    <>
                      <li>All trials and observations</li>
                      <li>All projects and blocks</li>
                      <li>Formulations and ingredients</li>
                      <li>App settings</li>
                    </>
                  )}
                  {backupType === BACKUP_TYPES.TRIALS && (
                    <>
                      <li>Trials and efficacy data</li>
                      <li>Observations</li>
                      <li>Block assignments</li>
                    </>
                  )}
                  {backupType === BACKUP_TYPES.PROJECTS && (
                    <>
                      <li>Project details</li>
                      <li>Block configurations</li>
                      <li>Treatment layouts</li>
                    </>
                  )}
                </ul>
              </div>

              <button
                onClick={handleBackup}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50"
              >
                {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                {isLoading ? 'Creating Backup...' : 'Create Backup Now'}
              </button>
            </div>
          )}

          {/* Restore Tab */}
          {activeTab === 'restore' && (
            <div className="space-y-4">
              {selectedProvider === BACKUP_PROVIDERS.LOCAL_FILE && (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
                  <FileJson className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                  <p className="text-sm text-slate-600 mb-3">
                    Select a backup file from your computer
                  </p>
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 transition">
                    <Upload className="w-4 h-4" />
                    Choose File
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileRestore}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {(selectedProvider === BACKUP_PROVIDERS.GOOGLE_DRIVE && !isSignedIn.google) && (
                <div className="text-center py-8">
                  <CloudOff className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-600 mb-3">Sign in to access your Google Drive backups</p>
                  <button
                    onClick={() => handleSignIn(BACKUP_PROVIDERS.GOOGLE_DRIVE)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                  >
                    Sign in to Google Drive
                  </button>
                </div>
              )}

              {(selectedProvider === BACKUP_PROVIDERS.DROPBOX && !isSignedIn.dropbox) && (
                <div className="text-center py-8">
                  <CloudOff className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-600 mb-3">Sign in to access your Dropbox backups</p>
                  <button
                    onClick={() => handleSignIn(BACKUP_PROVIDERS.DROPBOX)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                  >
                    Sign in to Dropbox
                  </button>
                </div>
              )}

              {isLoading && (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Loading backups...</p>
                </div>
              )}

              {!isLoading && backups.length > 0 && (
                <div className="space-y-2">
                  {backups.map((backup, index) => (
                    <div
                      key={backup.id || index}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{backup.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatDate(backup.createdTime || backup.client_modified)} • {formatSize(backup.size)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleRestore(backup)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Restore"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(backup)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isLoading && backups.length === 0 && (
                <div className="text-center py-8">
                  <Database className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No backups found</p>
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-800 mb-3">Connected Accounts</h4>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="font-bold text-blue-700 text-sm">G</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">Google Drive</p>
                        <p className="text-xs text-slate-500">
                          {isSignedIn.google ? 'Connected' : 'Not connected'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => isSignedIn.google 
                        ? handleSignOut(BACKUP_PROVIDERS.GOOGLE_DRIVE)
                        : handleSignIn(BACKUP_PROVIDERS.GOOGLE_DRIVE)
                      }
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        isSignedIn.google
                          ? 'text-red-600 hover:bg-red-50'
                          : 'text-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      {isSignedIn.google ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                        <Cloud className="w-5 h-5 text-indigo-700" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">Dropbox</p>
                        <p className="text-xs text-slate-500">
                          {isSignedIn.dropbox ? 'Connected' : 'Not connected'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => isSignedIn.dropbox
                        ? handleSignOut(BACKUP_PROVIDERS.DROPBOX)
                        : handleSignIn(BACKUP_PROVIDERS.DROPBOX)
                      }
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        isSignedIn.dropbox
                          ? 'text-red-600 hover:bg-red-50'
                          : 'text-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      {isSignedIn.dropbox ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    <strong>Note:</strong> For Google Drive and Dropbox integration to work, 
                    you need to configure API keys in the application settings. 
                    Contact your administrator to enable cloud backup.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
