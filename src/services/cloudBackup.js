/**
 * Cloud Backup Service
 * Handles backup/restore to Google Drive and Dropbox
 */

import { safeJsonParse } from '../utils/helpers.js';

// Backup providers
export const BACKUP_PROVIDERS = {
  GOOGLE_DRIVE: 'google_drive',
  DROPBOX: 'dropbox',
  LOCAL_FILE: 'local_file'
};

// Backup types
export const BACKUP_TYPES = {
  FULL: 'full',           // Everything
  TRIALS: 'trials',       // Trials + observations
  PROJECTS: 'projects',   // Projects + blocks
  SETTINGS: 'settings'    // App settings only
};

// Google Drive API constants
const GOOGLE_API_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];

// Dropbox API constants  
const DROPBOX_APP_KEY = 'YOUR_DROPBOX_APP_KEY'; // Replace with actual app key

/**
 * Initialize Google Drive API
 */
export async function initGoogleDrive(clientId) {
  return new Promise((resolve, reject) => {
    if (!window.gapi) {
      reject(new Error('Google API not loaded'));
      return;
    }
    
    window.gapi.load('client:auth2', async () => {
      try {
        await window.gapi.client.init({
          clientId,
          scope: GOOGLE_API_SCOPE,
          discoveryDocs: GOOGLE_DISCOVERY_DOCS
        });
        resolve(window.gapi);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Sign in to Google
 */
export async function signInGoogle() {
  if (!window.gapi?.auth2) {
    throw new Error('Google API not initialized');
  }
  
  const auth2 = window.gapi.auth2.getAuthInstance();
  await auth2.signIn();
  return auth2.currentUser.get().getBasicProfile();
}

/**
 * Sign out from Google
 */
export async function signOutGoogle() {
  if (!window.gapi?.auth2) return;
  
  const auth2 = window.gapi.auth2.getAuthInstance();
  await auth2.signOut();
}

/**
 * Check if signed in to Google
 */
export function isSignedInGoogle() {
  if (!window.gapi?.auth2) return false;
  return window.gapi.auth2.getAuthInstance().isSignedIn.get();
}

/**
 * Create backup file and upload to Google Drive
 */
export async function backupToGoogleDrive(data, filename) {
  if (!isSignedInGoogle()) {
    throw new Error('Not signed in to Google Drive');
  }
  
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  
  // Create metadata
  const metadata = {
    name: filename,
    mimeType: 'application/json',
    appProperties: {
      backupType: 'herbicide_trial_manager',
      createdAt: new Date().toISOString()
    }
  };
  
  // Create multipart request
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);
  
  const accessToken = window.gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: form
  });
  
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * List backups from Google Drive
 */
export async function listGoogleDriveBackups() {
  if (!isSignedInGoogle()) {
    throw new Error('Not signed in to Google Drive');
  }
  
  const response = await window.gapi.client.drive.files.list({
    q: "appProperties has { key='backupType' and value='herbicide_trial_manager' }",
    orderBy: 'createdTime desc',
    fields: 'files(id, name, createdTime, size, appProperties)'
  });
  
  return response.result.files || [];
}

/**
 * Download backup from Google Drive
 */
export async function downloadFromGoogleDrive(fileId) {
  if (!isSignedInGoogle()) {
    throw new Error('Not signed in to Google Drive');
  }
  
  const response = await window.gapi.client.drive.files.get({
    fileId,
    alt: 'media'
  });
  
  return response.result;
}

/**
 * Delete backup from Google Drive
 */
export async function deleteFromGoogleDrive(fileId) {
  if (!isSignedInGoogle()) {
    throw new Error('Not signed in to Google Drive');
  }
  
  await window.gapi.client.drive.files.delete({ fileId });
}

/**
 * Initialize Dropbox
 */
export function initDropbox() {
  if (!window.Dropbox) {
    throw new Error('Dropbox SDK not loaded');
  }
  
  return new window.Dropbox.Dropbox({ clientId: DROPBOX_APP_KEY });
}

/**
 * Get Dropbox auth URL
 */
export function getDropboxAuthUrl(redirectUri) {
  const dbx = initDropbox();
  return dbx.auth.getAuthenticationUrl(redirectUri);
}

/**
 * Set Dropbox access token from URL hash
 */
export function setDropboxTokenFromUrl() {
  const dbx = initDropbox();
  const accessToken = dbx.auth.parseQueryString(window.location.hash);
  
  if (accessToken.access_token) {
    localStorage.setItem('dropbox_token', accessToken.access_token);
    return accessToken.access_token;
  }
  
  return null;
}

/**
 * Get stored Dropbox token
 */
export function getDropboxToken() {
  return localStorage.getItem('dropbox_token');
}

/**
 * Check if Dropbox is authenticated
 */
export function isDropboxAuthenticated() {
  return !!getDropboxToken();
}

/**
 * Sign out from Dropbox
 */
export function signOutDropbox() {
  localStorage.removeItem('dropbox_token');
}

/**
 * Backup to Dropbox
 */
export async function backupToDropbox(data, filename) {
  const token = getDropboxToken();
  if (!token) {
    throw new Error('Not authenticated with Dropbox');
  }
  
  const dbx = new window.Dropbox.Dropbox({ accessToken: token });
  const content = JSON.stringify(data, null, 2);
  
  const response = await dbx.filesUpload({
    path: `/HerbicideTrialManager/${filename}`,
    contents: content,
    mode: { '.tag': 'overwrite' },
    autorename: true
  });
  
  return response.result;
}

/**
 * List backups from Dropbox
 */
export async function listDropboxBackups() {
  const token = getDropboxToken();
  if (!token) {
    throw new Error('Not authenticated with Dropbox');
  }
  
  const dbx = new window.Dropbox.Dropbox({ accessToken: token });
  
  try {
    const response = await dbx.filesListFolder({
      path: '/HerbicideTrialManager',
      recursive: false
    });
    
    return response.result.entries.filter(entry => entry['.tag'] === 'file');
  } catch (err) {
    if (err.error?.error?.path?.['.tag'] === 'not_found') {
      // Folder doesn't exist yet
      return [];
    }
    throw err;
  }
}

/**
 * Download backup from Dropbox
 */
export async function downloadFromDropbox(path) {
  const token = getDropboxToken();
  if (!token) {
    throw new Error('Not authenticated with Dropbox');
  }
  
  const dbx = new window.Dropbox.Dropbox({ accessToken: token });
  
  const response = await dbx.filesDownload({ path });
  const blob = response.result.fileBlob;
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(safeJsonParse(reader.result, {}));
      } catch (err) {
        reject(new Error('Invalid backup file'));
      }
    };
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

/**
 * Delete backup from Dropbox
 */
export async function deleteFromDropbox(path) {
  const token = getDropboxToken();
  if (!token) {
    throw new Error('Not authenticated with Dropbox');
  }
  
  const dbx = new window.Dropbox.Dropbox({ accessToken: token });
  await dbx.filesDeleteV2({ path });
}

/**
 * Prepare backup data from app state
 */
export function prepareBackupData(state, type = BACKUP_TYPES.FULL) {
  const timestamp = new Date().toISOString();
  const version = '1.0';
  
  let backupData = {
    _meta: {
      version,
      timestamp,
      type,
      app: 'Herbicide Trial Manager'
    }
  };
  
  switch (type) {
    case BACKUP_TYPES.FULL:
      backupData = {
        ...backupData,
        trials: state.trials || [],
        projects: state.projects || [],
        formulations: state.formulations || [],
        ingredients: state.ingredients || [],
        blocks: state.blocks || []
      };
      break;
      
    case BACKUP_TYPES.TRIALS:
      backupData = {
        ...backupData,
        trials: state.trials || [],
        blocks: state.blocks || []
      };
      break;
      
    case BACKUP_TYPES.PROJECTS:
      backupData = {
        ...backupData,
        projects: state.projects || [],
        blocks: state.blocks || []
      };
      break;
      
    case BACKUP_TYPES.SETTINGS:
      backupData = {
        ...backupData,
        settings: state.settings || {}
      };
      break;
  }
  
  return backupData;
}

/**
 * Generate backup filename
 */
export function generateBackupFilename(type = BACKUP_TYPES.FULL) {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0];
  const timeStr = date.toTimeString().slice(0, 5).replace(':', '-');
  return `herbicide-trials-${type}-${dateStr}-${timeStr}.json`;
}

/**
 * Download backup as local file
 */
export function downloadLocalBackup(data, filename) {
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Restore from backup data
 */
export function restoreFromBackup(backupData, currentState) {
  if (!backupData._meta) {
    throw new Error('Invalid backup file');
  }
  
  const restoredState = { ...currentState };
  
  // Merge data based on type
  if (backupData.trials) {
    restoredState.trials = mergeArrays(currentState.trials || [], backupData.trials, 'ID');
  }
  
  if (backupData.projects) {
    restoredState.projects = mergeArrays(currentState.projects || [], backupData.projects, 'ID');
  }
  
  if (backupData.formulations) {
    restoredState.formulations = mergeArrays(currentState.formulations || [], backupData.formulations, 'ID');
  }
  
  if (backupData.ingredients) {
    restoredState.ingredients = mergeArrays(currentState.ingredients || [], backupData.ingredients, 'ID');
  }
  
  if (backupData.blocks) {
    restoredState.blocks = mergeArrays(currentState.blocks || [], backupData.blocks, 'ID');
  }
  
  if (backupData.settings) {
    restoredState.settings = { ...currentState.settings, ...backupData.settings };
  }
  
  return restoredState;
}

/**
 * Merge arrays by ID, preferring newer LastModified
 */
function mergeArrays(current, backup, idField) {
  const merged = [...current];
  const idMap = new Map(merged.map(item => [item[idField], item]));
  
  backup.forEach(item => {
    const existing = idMap.get(item[idField]);
    
    if (!existing) {
      // New item from backup
      merged.push(item);
    } else {
      // Compare timestamps
      const existingTime = new Date(existing.LastModified || 0);
      const backupTime = new Date(item.LastModified || 0);
      
      if (backupTime > existingTime) {
        // Backup is newer, replace
        const index = merged.findIndex(i => i[idField] === item[idField]);
        merged[index] = item;
      }
    }
  });
  
  return merged;
}

/**
 * Auto-backup (can be called periodically)
 */
export async function autoBackup(state, provider, onProgress = null) {
  try {
    onProgress?.('Preparing backup...');
    
    const data = prepareBackupData(state, BACKUP_TYPES.FULL);
    const filename = generateBackupFilename(BACKUP_TYPES.FULL);
    
    onProgress?.('Uploading...');
    
    switch (provider) {
      case BACKUP_PROVIDERS.GOOGLE_DRIVE:
        if (!isSignedInGoogle()) {
          throw new Error('Not signed in to Google Drive');
        }
        return await backupToGoogleDrive(data, filename);
        
      case BACKUP_PROVIDERS.DROPBOX:
        if (!isDropboxAuthenticated()) {
          throw new Error('Not authenticated with Dropbox');
        }
        return await backupToDropbox(data, filename);
        
      case BACKUP_PROVIDERS.LOCAL_FILE:
        downloadLocalBackup(data, filename);
        return { local: true, filename };
        
      default:
        throw new Error('Unknown backup provider');
    }
  } catch (err) {
    onProgress?.(`Error: ${err.message}`);
    throw err;
  }
}

// Window exports
if (typeof window !== 'undefined') {
  window.cloudBackup = {
    BACKUP_PROVIDERS,
    BACKUP_TYPES,
    initGoogleDrive,
    signInGoogle,
    signOutGoogle,
    isSignedInGoogle,
    backupToGoogleDrive,
    listGoogleDriveBackups,
    downloadFromGoogleDrive,
    deleteFromGoogleDrive,
    initDropbox,
    getDropboxAuthUrl,
    setDropboxTokenFromUrl,
    isDropboxAuthenticated,
    signOutDropbox,
    backupToDropbox,
    listDropboxBackups,
    downloadFromDropbox,
    deleteFromDropbox,
    prepareBackupData,
    generateBackupFilename,
    downloadLocalBackup,
    restoreFromBackup,
    autoBackup
  };
}

export default {
  BACKUP_PROVIDERS,
  BACKUP_TYPES,
  initGoogleDrive,
  signInGoogle,
  signOutGoogle,
  isSignedInGoogle,
  backupToGoogleDrive,
  listGoogleDriveBackups,
  downloadFromGoogleDrive,
  deleteFromGoogleDrive,
  initDropbox,
    getDropboxAuthUrl,
  setDropboxTokenFromUrl,
  isDropboxAuthenticated,
  signOutDropbox,
  backupToDropbox,
  listDropboxBackups,
  downloadFromDropbox,
  deleteFromDropbox,
  prepareBackupData,
  generateBackupFilename,
  downloadLocalBackup,
  restoreFromBackup,
  autoBackup
};
