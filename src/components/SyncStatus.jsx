/**
 * Sync Status Indicator Component
 * Shows online/offline status, sync progress, and conflict alerts
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  initSyncManager, 
  getSyncStatus, 
  isOnline, 
  onSyncStatusChange,
  checkForConflicts,
  resolveConflictWithStrategy,
  autoMergeConflict,
  forceSync,
  SYNC_STATUS 
} from '../services/syncManager.js';
import { 
  Wifi, WifiOff, CheckCircle, AlertTriangle, 
  RefreshCw, Cloud, CloudOff, GitMerge,
  ChevronRight, X, FileJson, Download, Upload
} from 'lucide-react';

export default function SyncStatus() {
  const [status, setStatus] = useState(SYNC_STATUS.ONLINE);
  const [details, setDetails] = useState(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Initialize and listen for status changes
  useEffect(() => {
    initSyncManager();
    setStatus(getSyncStatus());
    
    const unsubscribe = onSyncStatusChange((newStatus, newDetails) => {
      setStatus(newStatus);
      setDetails(newDetails);
      
      if (newStatus === SYNC_STATUS.CONFLICTS) {
        loadConflicts();
      }
    });
    
    // Check for conflicts on mount
    loadConflicts();
    
    return unsubscribe;
  }, []);

  // Load unresolved conflicts
  const loadConflicts = useCallback(async () => {
    const unresolved = await checkForConflicts();
    setConflicts(unresolved);
  }, []);

  // Force sync
  const handleForceSync = useCallback(async () => {
    await forceSync();
  }, []);

  // Resolve conflict
  const handleResolve = useCallback(async (conflictId, strategy) => {
    let mergedData = null;
    
    if (strategy === 'merge') {
      const conflict = conflicts.find(c => c.id === conflictId);
      if (conflict) {
        mergedData = autoMergeConflict(conflict.localData, conflict.serverData);
      }
    }
    
    await resolveConflictWithStrategy(conflictId, strategy, mergedData);
    await loadConflicts();
  }, [conflicts]);

  // Get status display config
  const getStatusConfig = () => {
    switch (status) {
      case SYNC_STATUS.ONLINE:
        return {
          icon: <Wifi className="w-4 h-4" />,
          label: 'Online',
          color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
          pulse: false
        };
      case SYNC_STATUS.OFFLINE:
        return {
          icon: <WifiOff className="w-4 h-4" />,
          label: 'Offline',
          color: 'text-amber-600 bg-amber-50 border-amber-200',
          pulse: false
        };
      case SYNC_STATUS.SYNCING:
        return {
          icon: <RefreshCw className="w-4 h-4 animate-spin" />,
          label: 'Syncing...',
          color: 'text-blue-600 bg-blue-50 border-blue-200',
          pulse: true
        };
      case SYNC_STATUS.SYNCED:
        return {
          icon: <CheckCircle className="w-4 h-4" />,
          label: 'Synced',
          color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
          pulse: false
        };
      case SYNC_STATUS.ERROR:
        return {
          icon: <CloudOff className="w-4 h-4" />,
          label: 'Sync Error',
          color: 'text-red-600 bg-red-50 border-red-200',
          pulse: false
        };
      case SYNC_STATUS.CONFLICTS:
        return {
          icon: <GitMerge className="w-4 h-4" />,
          label: `${details?.conflictCount || conflicts.length} Conflicts`,
          color: 'text-orange-600 bg-orange-50 border-orange-200',
          pulse: true
        };
      default:
        return {
          icon: <Cloud className="w-4 h-4" />,
          label: 'Unknown',
          color: 'text-slate-600 bg-slate-50 border-slate-200',
          pulse: false
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="relative">
      {/* Compact Status Badge */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${config.color} ${config.pulse ? 'animate-pulse' : ''}`}
      >
        {config.icon}
        <span>{config.label}</span>
        {(status === SYNC_STATUS.CONFLICTS || (details?.pendingCount > 0)) && (
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        )}
      </button>

      {/* Expanded Panel */}
      {isExpanded && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800">Sync Status</h4>
              <button 
                onClick={() => setIsExpanded(false)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Connection</span>
                <span className={isOnline() ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                  {isOnline() ? 'Online' : 'Offline'}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Status</span>
                <span className="font-medium text-slate-700 capitalize">{status}</span>
              </div>
              
              {details?.pendingCount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Pending</span>
                  <span className="font-medium text-amber-600">{details.pendingCount} items</span>
                </div>
              )}
              
              {conflicts.length > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Conflicts</span>
                  <span className="font-medium text-orange-600">{conflicts.length} unresolved</span>
                </div>
              )}
            </div>
            
            {isOnline() && status !== SYNC_STATUS.SYNCING && (
              <button
                onClick={handleForceSync}
                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
              >
                <RefreshCw className="w-4 h-4" />
                Force Sync Now
              </button>
            )}
          </div>
          
          {/* Conflict Warning */}
          {conflicts.length > 0 && (
            <div className="p-4 bg-orange-50 border-t border-orange-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-orange-800">
                    {conflicts.length} Data Conflict{conflicts.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-orange-600 mt-1">
                    Some of your data conflicts with the server version.
                  </p>
                  <button
                    onClick={() => setShowConflicts(!showConflicts)}
                    className="mt-2 text-xs font-medium text-orange-700 hover:text-orange-800 underline"
                  >
                    {showConflicts ? 'Hide' : 'Resolve Conflicts'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conflict Resolution Modal */}
      {showConflicts && conflicts.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-slate-800">Resolve Conflicts</h3>
              </div>
              <button 
                onClick={() => setShowConflicts(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <p className="text-sm text-slate-600 mb-4">
                The following items have conflicting changes between your local data and the server. 
                Choose which version to keep, or let the system auto-merge them.
              </p>
              
              <div className="space-y-4">
                {conflicts.map(conflict => (
                  <div key={conflict.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">
                        {conflict.entityType}: {conflict.localData?.Name || conflict.localData?.FormulationName || conflict.entityId}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(conflict.detectedAt).toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="p-4 grid grid-cols-2 gap-4">
                      {/* Local Version */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Download className="w-4 h-4 text-blue-600" />
                          <span className="font-semibold text-blue-800 text-sm">Your Version</span>
                        </div>
                        <p className="text-xs text-blue-600 mb-1">
                          Modified: {new Date(conflict.localData?.LastModified).toLocaleString()}
                        </p>
                        <pre className="text-xs text-slate-600 bg-white p-2 rounded overflow-x-auto max-h-32">
                          {JSON.stringify(conflict.localData, null, 2)}
                        </pre>
                        <button
                          onClick={() => handleResolve(conflict.id, 'local')}
                          className="mt-2 w-full px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition"
                        >
                          Keep Mine
                        </button>
                      </div>
                      
                      {/* Server Version */}
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Upload className="w-4 h-4 text-emerald-600" />
                          <span className="font-semibold text-emerald-800 text-sm">Server Version</span>
                        </div>
                        <p className="text-xs text-emerald-600 mb-1">
                          Modified: {new Date(conflict.serverData?.LastModified).toLocaleString()}
                        </p>
                        <pre className="text-xs text-slate-600 bg-white p-2 rounded overflow-x-auto max-h-32">
                          {JSON.stringify(conflict.serverData, null, 2)}
                        </pre>
                        <button
                          onClick={() => handleResolve(conflict.id, 'server')}
                          className="mt-2 w-full px-3 py-1.5 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700 transition"
                        >
                          Use Server
                        </button>
                      </div>
                    </div>
                    
                    {/* Auto-merge option */}
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => handleResolve(conflict.id, 'merge')}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition"
                      >
                        <FileJson className="w-4 h-4" />
                        Auto-Merge (Intelligent Merge)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
