import { useEffect, useState, useCallback } from 'react';
import { useAppState } from './useAppState.jsx';
import { processSyncQueue } from '../services/sync.js';

export function useSync() {
  const { state, dispatch, getAppState, updateState } = useAppState();
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true); // Default true, managed by platform adapter
  const [isSyncing, setIsSyncing] = useState(false);

  const showToast = useCallback((msg, type) => {
    if(state.platformAdapter && state.platformAdapter.showToast) { state.platformAdapter.showToast(msg, type); } else { console.log("Toast:", type, msg); }
  }, [state.platformAdapter]);

  const renderSyncStatus = useCallback(() => {
    if(state.platformAdapter && state.platformAdapter.renderSyncStatus) { state.platformAdapter.renderSyncStatus(); }
  }, [state.platformAdapter]);


  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Back online! Syncing data...', 'info');
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToast('Offline Mode Active', 'info');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  // Initial sync and when isOnline changes
  useEffect(() => {
    if (isOnline && state.syncQueue && state.syncQueue.length > 0) {
      const pending = state.syncQueue.filter(s => s.status === 'pending' || s.status === 'failed').length;
      if (pending > 0) {
        runSync();
      }
    }
  }, [isOnline, state.syncQueue]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isSyncing && isOnline && state.syncQueue && state.syncQueue.length > 0) {
        const pending = state.syncQueue.filter(s => s.status === 'pending' || s.status === 'failed').length;
        if (pending > 0) runSync();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [isSyncing, isOnline, state.syncQueue]);

  const runSync = useCallback(async () => {
    if (isSyncing || !isOnline) return;

    setIsSyncing(true);
    try {
      await processSyncQueue(getAppState, updateState, showToast, renderSyncStatus);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline, getAppState, updateState, showToast, renderSyncStatus]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.processSyncQueue = runSync;
    }
    return () => {
      if (typeof window !== 'undefined' && window.processSyncQueue === runSync) {
        window.processSyncQueue = undefined;
      }
    };
  }, [runSync]);

  const addToSyncQueue = useCallback((action) => {
    dispatch({ type: 'ADD_SYNC_ITEM', payload: action });
  }, [dispatch]);

  const clearSyncQueue = useCallback(() => {
    dispatch({ type: 'SET_SYNC_QUEUE', payload: [] });
  }, [dispatch]);

  const pendingCount = state.syncQueue.filter(s => s.status === 'pending' || s.status === 'failed').length;

  return {
    isOnline,
    isSyncing,
    syncQueue: state.syncQueue,
    pendingCount,
    runSync,
    addToSyncQueue,
    clearSyncQueue
  };
}
