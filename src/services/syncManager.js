/**
 * Sync Manager
 * Handles online/offline detection, sync operations, and conflict resolution
 */

import { 
  queueForSync, 
  getPendingSyncItems, 
  updateSyncStatus, 
  removeFromSyncQueue,
  createConflict,
  getUnresolvedConflicts,
  resolveConflict,
  saveToStore,
  getFromStore
} from './offlineDB.js';

// Sync status
export const SYNC_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  ERROR: 'error',
  CONFLICTS: 'conflicts'
};

// Event listeners
const listeners = new Set();

let currentStatus = SYNC_STATUS.ONLINE;
let isInitialized = false;

/**
 * Subscribe to sync status changes
 */
export function onSyncStatusChange(callback) {
  listeners.add(callback);
  
  // Return unsubscribe function
  return () => listeners.delete(callback);
}

/**
 * Notify all listeners of status change
 */
function notifyStatusChange(status, details = null) {
  currentStatus = status;
  listeners.forEach(cb => {
    try {
      cb(status, details);
    } catch (err) {
      console.error('Sync status listener error:', err);
    }
  });
}

/**
 * Get current sync status
 */
export function getSyncStatus() {
  return currentStatus;
}

/**
 * Check if online
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Initialize sync manager
 */
export function initSyncManager() {
  if (isInitialized) return;
  
  // Listen for online/offline events
  window.addEventListener('online', () => {
    notifyStatusChange(SYNC_STATUS.ONLINE);
    // Try to sync when back online
    processSyncQueue();
  });
  
  window.addEventListener('offline', () => {
    notifyStatusChange(SYNC_STATUS.OFFLINE);
  });
  
  // Check for conflicts on init
  checkForConflicts();
  
  // Try to sync on init if online
  if (isOnline()) {
    processSyncQueue();
  }
  
  isInitialized = true;
}

/**
 * Check for unresolved conflicts
 */
export async function checkForConflicts() {
  const conflicts = await getUnresolvedConflicts();
  if (conflicts.length > 0) {
    notifyStatusChange(SYNC_STATUS.CONFLICTS, { conflictCount: conflicts.length });
  }
  return conflicts;
}

/**
 * Resolve a conflict with chosen strategy
 */
export async function resolveConflictWithStrategy(conflictId, strategy, mergedData = null) {
  const conflicts = await getUnresolvedConflicts();
  const conflict = conflicts.find(c => c.id === conflictId);
  
  if (!conflict) throw new Error('Conflict not found');
  
  let resolvedData;
  
  switch (strategy) {
    case 'local':
      resolvedData = conflict.localData;
      await saveToStore(conflict.entityType, resolvedData);
      await queueForSync(conflict.entityType, conflict.entityId, 'update', resolvedData);
      break;
      
    case 'server':
      resolvedData = conflict.serverData;
      await saveToStore(conflict.entityType, resolvedData);
      break;
      
    case 'merge':
      if (!mergedData) throw new Error('Merged data required for merge strategy');
      resolvedData = mergedData;
      await saveToStore(conflict.entityType, resolvedData);
      await queueForSync(conflict.entityType, conflict.entityId, 'update', resolvedData);
      break;
      
    default:
      throw new Error('Invalid resolution strategy');
  }
  
  await resolveConflict(conflictId, strategy, resolvedData);
  
  // Re-check conflicts
  const remaining = await getUnresolvedConflicts();
  if (remaining.length === 0) {
    notifyStatusChange(isOnline() ? SYNC_STATUS.ONLINE : SYNC_STATUS.OFFLINE);
  }
  
  return resolvedData;
}

/**
 * Auto-merge conflict data
 */
export function autoMergeConflict(localData, serverData) {
  // Always prefer server LastModified
  const localTime = new Date(localData.LastModified || 0);
  const serverTime = new Date(serverData.LastModified || 0);
  
  // If server is newer, prefer server values but keep any local additions
  if (serverTime >= localTime) {
    // Merge strategy: server base + local additions for new fields
    const merged = { ...serverData };
    
    // Preserve any local fields that don't exist on server
    Object.keys(localData).forEach(key => {
      if (!(key in serverData) && localData[key] !== null && localData[key] !== undefined) {
        merged[key] = localData[key];
      }
    });
    
    // Special handling for efficacy data - merge arrays intelligently
    if (localData.EfficacyDataJSON && serverData.EfficacyDataJSON) {
      try {
        const localEfficacy = typeof localData.EfficacyDataJSON === 'string' 
          ? JSON.parse(localData.EfficacyDataJSON) 
          : localData.EfficacyDataJSON;
        const serverEfficacy = typeof serverData.EfficacyDataJSON === 'string' 
          ? JSON.parse(serverData.EfficacyDataJSON) 
          : serverData.EfficacyDataJSON;
        
        if (Array.isArray(localEfficacy) && Array.isArray(serverEfficacy)) {
          // Merge by DAA, preferring local if same DAA
          const efficacyByDAA = new Map();
          
          serverEfficacy.forEach(obs => {
            const daa = obs.daa || obs.daysAfterApplication;
            efficacyByDAA.set(daa, obs);
          });
          
          localEfficacy.forEach(obs => {
            const daa = obs.daa || obs.daysAfterApplication;
            // Local takes precedence for same DAA (user recorded locally)
            efficacyByDAA.set(daa, obs);
          });
          
          // Sort by DAA
          const mergedEfficacy = Array.from(efficacyByDAA.values())
            .sort((a, b) => (a.daa || 0) - (b.daa || 0));
          
          merged.EfficacyDataJSON = JSON.stringify(mergedEfficacy);
        }
      } catch (err) {
        console.warn('Failed to merge efficacy data:', err);
      }
    }
    
    merged.LastModified = new Date().toISOString();
    return merged;
  }
  
  // Local is newer, prefer local
  return { ...localData, LastModified: new Date().toISOString() };
}

/**
 * Process sync queue
 */
export async function processSyncQueue() {
  if (!isOnline()) {
    notifyStatusChange(SYNC_STATUS.OFFLINE);
    return { processed: 0, failed: 0 };
  }
  
  notifyStatusChange(SYNC_STATUS.SYNCING);
  
  const pending = await getPendingSyncItems();
  
  if (pending.length === 0) {
    notifyStatusChange(SYNC_STATUS.SYNCED);
    return { processed: 0, failed: 0 };
  }
  
  let processed = 0;
  let failed = 0;
  const conflicts = [];
  
  for (const item of pending) {
    // Skip items that have been retried too many times
    if (item.retryCount >= 5) {
      await updateSyncStatus(item.id, 'failed', 'Max retries exceeded');
      failed++;
      continue;
    }
    
    try {
      // Simulate API call (replace with actual API)
      const result = await syncToServer(item);
      
      if (result.success) {
        await removeFromSyncQueue(item.id);
        processed++;
      } else if (result.conflict) {
        // Conflict detected
        await createConflict(
          item.entityType,
          item.entityId,
          item.data,
          result.serverData
        );
        await updateSyncStatus(item.id, 'conflict', 'Data conflict with server');
        conflicts.push({ item, serverData: result.serverData });
      } else {
        await updateSyncStatus(item.id, 'failed', result.error);
        failed++;
      }
    } catch (err) {
      await updateSyncStatus(item.id, 'failed', err.message);
      failed++;
    }
  }
  
  if (conflicts.length > 0) {
    notifyStatusChange(SYNC_STATUS.CONFLICTS, { 
      conflictCount: conflicts.length,
      processed,
      failed 
    });
  } else if (failed > 0) {
    notifyStatusChange(SYNC_STATUS.ERROR, { processed, failed });
  } else {
    notifyStatusChange(SYNC_STATUS.SYNCED, { processed });
  }
  
  return { processed, failed, conflicts: conflicts.length };
}

/**
 * Mock server sync (replace with actual API)
 */
async function syncToServer(syncItem) {
  // This is a placeholder - implement actual API call
  // Return { success: true } or { conflict: true, serverData: {...} } or { error: 'message' }
  
  // Simulate success for now
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({ success: true });
    }, 100);
  });
}

/**
 * Queue an operation for sync
 */
export async function queueOperation(entityType, entityId, operation, data) {
  if (!isOnline()) {
    // Queue for later sync
    await queueForSync(entityType, entityId, operation, data);
    notifyStatusChange(SYNC_STATUS.OFFLINE, { pendingCount: 1 });
    return { queued: true, synced: false };
  }
  
  // Online - try immediate sync
  try {
    const result = await syncToServer({
      entityType,
      entityId,
      operation,
      data
    });
    
    if (result.success) {
      return { queued: false, synced: true };
    } else if (result.conflict) {
      await createConflict(entityType, entityId, data, result.serverData);
      notifyStatusChange(SYNC_STATUS.CONFLICTS, { conflictCount: 1 });
      return { queued: false, synced: false, conflict: true };
    } else {
      // Failed, queue for retry
      await queueForSync(entityType, entityId, operation, data);
      return { queued: true, synced: false, error: result.error };
    }
  } catch (err) {
    // Error, queue for retry
    await queueForSync(entityType, entityId, operation, data);
    return { queued: true, synced: false, error: err.message };
  }
}

/**
 * Force sync now
 */
export async function forceSync() {
  return processSyncQueue();
}

/**
 * Get sync stats
 */
export async function getSyncStats() {
  const pending = await getPendingSyncItems();
  const conflicts = await getUnresolvedConflicts();
  
  return {
    status: currentStatus,
    isOnline: isOnline(),
    pendingCount: pending.length,
    conflictCount: conflicts.length,
    lastSync: pending.length > 0 
      ? Math.min(...pending.map(p => new Date(p.timestamp).getTime()))
      : null
  };
}

/**
 * Clear all pending sync items (use with caution)
 */
export async function clearSyncQueue() {
  const pending = await getPendingSyncItems();
  for (const item of pending) {
    await removeFromSyncQueue(item.id);
  }
  notifyStatusChange(isOnline() ? SYNC_STATUS.ONLINE : SYNC_STATUS.OFFLINE);
}

// Window exports
if (typeof window !== 'undefined') {
  window.initSyncManager = initSyncManager;
  window.getSyncStatus = getSyncStatus;
  window.isOnline = isOnline;
  window.processSyncQueue = processSyncQueue;
  window.forceSync = forceSync;
  window.getSyncStats = getSyncStats;
  window.checkForConflicts = checkForConflicts;
  window.resolveConflictWithStrategy = resolveConflictWithStrategy;
  window.autoMergeConflict = autoMergeConflict;
  window.onSyncStatusChange = onSyncStatusChange;
}

export default {
  SYNC_STATUS,
  initSyncManager,
  getSyncStatus,
  isOnline,
  processSyncQueue,
  forceSync,
  getSyncStats,
  queueOperation,
  checkForConflicts,
  resolveConflictWithStrategy,
  autoMergeConflict,
  clearSyncQueue,
  onSyncStatusChange
};
