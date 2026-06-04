/**
 * Offline-First Database Service
 * Uses IndexedDB for robust local storage with sync capabilities
 */

const DB_NAME = 'HerbicideTrialsDB';
const DB_VERSION = 1;

// Store names
const STORES = {
  TRIALS: 'trials',
  PROJECTS: 'projects',
  FORMULATIONS: 'formulations',
  INGREDIENTS: 'ingredients',
  SYNC_QUEUE: 'syncQueue',
  CONFLICTS: 'conflicts'
};

let db = null;

/**
 * Initialize IndexedDB
 */
export async function initOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      // Create stores
      if (!database.objectStoreNames.contains(STORES.TRIALS)) {
        const trialsStore = database.createObjectStore(STORES.TRIALS, { keyPath: 'ID' });
        trialsStore.createIndex('ProjectID', 'ProjectID', { unique: false });
        trialsStore.createIndex('Date', 'Date', { unique: false });
        trialsStore.createIndex('LastModified', 'LastModified', { unique: false });
      }
      
      if (!database.objectStoreNames.contains(STORES.PROJECTS)) {
        database.createObjectStore(STORES.PROJECTS, { keyPath: 'ID' });
      }
      
      if (!database.objectStoreNames.contains(STORES.FORMULATIONS)) {
        database.createObjectStore(STORES.FORMULATIONS, { keyPath: 'ID' });
      }
      
      if (!database.objectStoreNames.contains(STORES.INGREDIENTS)) {
        database.createObjectStore(STORES.INGREDIENTS, { keyPath: 'ID' });
      }
      
      if (!database.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = database.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('entityType', 'entityType', { unique: false });
        syncStore.createIndex('entityId', 'entityId', { unique: false });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        syncStore.createIndex('status', 'status', { unique: false });
      }
      
      if (!database.objectStoreNames.contains(STORES.CONFLICTS)) {
        const conflictStore = database.createObjectStore(STORES.CONFLICTS, { keyPath: 'id', autoIncrement: true });
        conflictStore.createIndex('entityType', 'entityType', { unique: false });
        conflictStore.createIndex('entityId', 'entityId', { unique: false });
        conflictStore.createIndex('resolved', 'resolved', { unique: false });
      }
    };
  });
}

/**
 * Get all items from a store
 */
export async function getAllFromStore(storeName) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get single item from store
 */
export async function getFromStore(storeName, id) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save item to store
 */
export async function saveToStore(storeName, item) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    // Add LastModified timestamp
    const itemWithTimestamp = {
      ...item,
      LastModified: new Date().toISOString()
    };
    
    const request = store.put(itemWithTimestamp);
    
    request.onsuccess = () => resolve(itemWithTimestamp);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete item from store
 */
export async function deleteFromStore(storeName, id) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add operation to sync queue
 */
export async function queueForSync(entityType, entityId, operation, data = null) {
  if (!db) await initOfflineDB();
  
  const syncItem = {
    entityType,
    entityId,
    operation, // 'create', 'update', 'delete'
    data,
    timestamp: new Date().toISOString(),
    status: 'pending',
    retryCount: 0
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const request = store.add(syncItem);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get pending sync items
 */
export async function getPendingSyncItems() {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readonly');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const index = store.index('status');
    const request = index.getAll('pending');
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update sync item status
 */
export async function updateSyncStatus(id, status, error = null) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const request = store.get(id);
    
    request.onsuccess = () => {
      const item = request.result;
      if (item) {
        item.status = status;
        item.lastAttempt = new Date().toISOString();
        if (error) item.lastError = error;
        if (status === 'failed') item.retryCount = (item.retryCount || 0) + 1;
        
        store.put(item);
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove synced item from queue
 */
export async function removeFromSyncQueue(id) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Create conflict record
 */
export async function createConflict(entityType, entityId, localData, serverData) {
  if (!db) await initOfflineDB();
  
  const conflict = {
    entityType,
    entityId,
    localData,
    serverData,
    detectedAt: new Date().toISOString(),
    resolved: 0,
    resolution: null
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CONFLICTS], 'readwrite');
    const store = transaction.objectStore(STORES.CONFLICTS);
    const request = store.add(conflict);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get unresolved conflicts
 * Uses getAll() + JS filter because IDB cannot query boolean keys reliably
 */
export async function getUnresolvedConflicts() {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CONFLICTS], 'readonly');
    const store = transaction.objectStore(STORES.CONFLICTS);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const unresolved = (request.result || []).filter(c => !c.resolved);
      resolve(unresolved);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Resolve conflict
 */
export async function resolveConflict(id, resolution, mergedData = null) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CONFLICTS], 'readwrite');
    const store = transaction.objectStore(STORES.CONFLICTS);
    const request = store.get(id);
    
    request.onsuccess = () => {
      const conflict = request.result;
      if (conflict) {
        conflict.resolved = 1;
        conflict.resolution = resolution; // 'local', 'server', 'merge'
        conflict.resolvedAt = new Date().toISOString();
        conflict.mergedData = mergedData;
        store.put(conflict);
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Bulk save data (for initial sync)
 */
export async function bulkSaveToStore(storeName, items) {
  if (!db) await initOfflineDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    let completed = 0;
    let errors = [];
    
    items.forEach(item => {
      const itemWithTimestamp = {
        ...item,
        LastModified: new Date().toISOString()
      };
      
      const request = store.put(itemWithTimestamp);
      
      request.onsuccess = () => {
        completed++;
        if (completed === items.length) {
          resolve({ success: completed, errors });
        }
      };
      
      request.onerror = () => {
        errors.push({ item, error: request.error });
        completed++;
        if (completed === items.length) {
          resolve({ success: completed - errors.length, errors });
        }
      };
    });
    
    if (items.length === 0) {
      resolve({ success: 0, errors: [] });
    }
  });
}

/**
 * Clear all stores (for logout/data reset)
 */
export async function clearAllStores() {
  if (!db) await initOfflineDB();
  
  const storeNames = Object.values(STORES);
  
  for (const storeName of storeNames) {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Get database stats
 */
export async function getDBStats() {
  if (!db) await initOfflineDB();
  
  const stats = {};
  
  for (const [key, storeName] of Object.entries(STORES)) {
    const count = await new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    stats[key] = count;
  }
  
  return stats;
}

// Window exports
if (typeof window !== 'undefined') {
  window.initOfflineDB = initOfflineDB;
  window.getAllFromStore = getAllFromStore;
  window.saveToStore = saveToStore;
  window.queueForSync = queueForSync;
  window.getPendingSyncItems = getPendingSyncItems;
  window.getUnresolvedConflicts = getUnresolvedConflicts;
  window.getDBStats = getDBStats;
}

export default {
  STORES,
  initOfflineDB,
  getAllFromStore,
  getFromStore,
  saveToStore,
  deleteFromStore,
  queueForSync,
  getPendingSyncItems,
  updateSyncStatus,
  removeFromSyncQueue,
  createConflict,
  getUnresolvedConflicts,
  resolveConflict,
  bulkSaveToStore,
  clearAllStores,
  getDBStats
};
