import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { initFirebase, isFirebaseReady } from '../services/firebase.js';

const initialState = {
  auth: {
    user: null,
    token: null
  },
  currentPage: 'dashboard',
  ingredients: [],
  formulations: [],
  trials: [],
  organisations: [],
  projects: [],
  blocks: [],
  selectedTrials: [],
  photoQueue: [],
  croppedPhotosData: [],
  photoDeletionRequested: false,
  currentTrialIdForCamera: null,
  cameraMode: 'general',
  aiChatHistory: [],
  aiChatSessions: [],
  currentAiChatSessionId: null,
  aiAttachedImage: { fileData: null, mimeType: null },
  settings: {
    apiKeys: [],
    currentApiKeyIndex: 0,
    scriptUrl: '',
    sheetId: '',
    folderId: '',
    autoAnalyzePhotos: true,
    openWeatherMapKey: '',
    agAnalyticsKey: '',
    qrCodeFields: { FormulationName: true, InvestigatorName: true, Date: true, Dosage: true, Location: false, Result: false, WeedSpecies: false, Weather: false },
    qrOnlineFields: { showInvestigator: true, showDate: true, showLocation: true, showDosage: true, showWeedSpecies: true, showResult: true, showWeather: true, showIngredients: false, showConclusion: true, showPhotos: true },
    // ── Firebase ────────────────────────────────────────────────────────────
    firebaseEnabled: false,
    firebaseConfig: {
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
    },
    // ── Google Sheet mirror (Plan B) ─────────────────────────────────────────
    sheetMirrorEnabled: false,
  },
  charts: {},
  efficacyDataForModal: [],
  bulkAnalysisState: {
    isRunning: false,
    isPaused: false,
    lastProcessedIndex: -1,
    trialsToProcess: [],
    totalToProcess: 0
  },
  backgroundQueue: new Map(),
  syncQueue: [],
  aiQueue: [],
  isAiQueueRunning: false,
  filterState: {
    search: '',
    formulationText: '',
    formulation: '',
    startDate: '',
    endDate: '',
    sortBy: 'date'
  },
  userAdminFilters: {
    search: '',
    role: 'all',
    status: 'all',
    sortBy: 'updated-desc'
  },
  userAdminTestResults: {},
  pendingUserBackupImportUserId: null,
  users: [],
  hasLoadedInitialData: false
};

const AppStateContext = createContext();

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, ...action.payload };
    case 'UPDATE_SETTINGS': {
      const newSettings = { ...state.settings, ...action.payload };
      localStorage.setItem('appSettings', JSON.stringify(newSettings));
      return { ...state, settings: newSettings };
    }
    case 'SET_AUTH': {
      const authState = { ...state.auth, ...action.payload };
      localStorage.setItem('appAuth', JSON.stringify(authState));
      return { ...state, auth: authState };
    }
    case 'LOGOUT':
      localStorage.removeItem('appAuth');
      return { ...state, auth: { user: null, token: null }, hasLoadedInitialData: false };
    case 'SET_SYNC_QUEUE':
      localStorage.setItem('syncQueue', JSON.stringify(action.payload));
      return { ...state, syncQueue: action.payload };
    case 'ADD_SYNC_ITEM': {
      const newQueue = [...state.syncQueue, action.payload];
      localStorage.setItem('syncQueue', JSON.stringify(newQueue));
      return { ...state, syncQueue: newQueue };
    }
    default:
      return state;
  }
}

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('appSettings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        dispatch({ type: 'SET_STATE', payload: { settings: parsed } });
        // Auto-initialize Firebase if config is saved and enabled
        if (parsed.firebaseEnabled && parsed.firebaseConfig?.apiKey && parsed.firebaseConfig?.projectId) {
          try {
            initFirebase(parsed.firebaseConfig);
            console.log('[Firebase] Auto-initialized from saved settings.');
          } catch (fbErr) {
            console.error('[Firebase] Auto-init failed:', fbErr.message);
          }
        }
      }

      const savedSyncQueue = localStorage.getItem('syncQueue');
      if (savedSyncQueue) {
        dispatch({ type: 'SET_STATE', payload: { syncQueue: JSON.parse(savedSyncQueue) } });
      }

      const savedAuth = localStorage.getItem('appAuth');
      if (savedAuth) {
        dispatch({ type: 'SET_STATE', payload: { auth: JSON.parse(savedAuth) } });
      }
    } catch (e) {
      console.error('Failed to parse local storage data', e);
    }
  }, []);

  const updateState = useCallback((payload) => {
    dispatch({ type: 'SET_STATE', payload });
  }, []);

  const updateSettings = useCallback((payload) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload });
  }, []);

  const getAppState = useCallback(() => stateRef.current, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.getAppState = getAppState;
      window.updateState = updateState;
    }
  }, [getAppState, updateState]);

  const value = {
    state,
    dispatch,
    updateState,
    updateSettings,
    getAppState
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}
