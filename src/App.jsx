import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import PlotScanner from './pages/PlotScanner.jsx';
import DataManagement from './pages/DataManagement.jsx';
import Settings from './pages/Settings.jsx';
import UserManagement from './pages/UserManagement.jsx';
import AIAssistant from './pages/AIAssistant.jsx';
import SmartSearch from './pages/SmartSearch.jsx';
import Analytics from './pages/Analytics.jsx';
import Reports from './pages/Reports.jsx';
import Statistics from './pages/Statistics.jsx';
import Alerts from './pages/Alerts.jsx';
import DoseResponse from './pages/DoseResponse.jsx';
import ResistanceTracker from './pages/ResistanceTracker.jsx';
import FieldMap from './pages/FieldMap.jsx';
import Trials from './pages/Trials.jsx';
import Projects from './pages/Projects.jsx';
import Ingredients from './pages/Ingredients.jsx';
import Organisations from './pages/Organisations.jsx';
import Formulations from './pages/Formulations.jsx';
import { AppStateProvider } from './hooks/useAppState.jsx';
import Sidebar from './components/Sidebar.jsx';
import BottomNav from './components/BottomNav.jsx';
import Toast from './components/Toast.jsx';
import LoadingOverlay from './components/LoadingOverlay.jsx';

import Setup from './pages/Setup.jsx';
import Login from './pages/Login.jsx';
import MigrationTool from './pages/MigrationTool.jsx';
import { useAuth } from './hooks/useAuth.js';
import { useAppState } from './hooks/useAppState.jsx';
import { getAllData } from './services/dataLayer.js';

import CompareTrials from './pages/CompareTrials.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PlaceholderPage from './pages/PlaceholderPage.jsx';
import LiveTrialPage from './pages/LiveTrialPage.jsx';





function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  const { state, updateState, getAppState } = useAppState();
  const { isAuthenticated } = useAuth();

  const firebaseEnabled = !!state.settings?.firebaseEnabled;
  const isConfigured = firebaseEnabled
    ? (!!state.settings?.firebaseConfig?.apiKey && !!state.settings?.firebaseConfig?.projectId)
    : (!!state.settings?.scriptUrl && !!state.settings?.sheetId && !!state.settings?.folderId);
  const hasLoadedData = state.hasLoadedInitialData;
  const hasCredentials = firebaseEnabled
    ? !!state.auth?.uid
    : (!!state.auth?.username && !!state.auth?.password);

  useEffect(() => {
    if (!isAuthenticated) {
      if (hasLoadedData) {
        updateState({ hasLoadedInitialData: false });
      }
      return;
    }

    if (!isConfigured || hasLoadedData || !hasCredentials) return;

    let cancelled = false;
    const loadAppData = async () => {
      window.dispatchEvent(new CustomEvent('app:loading', { detail: { show: true } }));
      try {
        const result = await getAllData({}, getAppState);

        if (cancelled) return;

        if (result && result._errType) {
          window.dispatchEvent(new CustomEvent('app:toast', {
            detail: { msg: `Failed to load data: ${result.message || result._errType}`, type: 'error' }
          }));
          return;
        }

        updateState({
          trials: Array.isArray(result?.trials) ? result.trials : [],
          projects: Array.isArray(result?.projects) ? result.projects : [],
          formulations: Array.isArray(result?.formulations) ? result.formulations : [],
          ingredients: Array.isArray(result?.ingredients) ? result.ingredients : [],
          organisations: Array.isArray(result?.organisations) ? result.organisations : [],
          blocks: Array.isArray(result?.blocks) ? result.blocks : [],
          hasLoadedInitialData: true
        });
      } catch (error) {
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Failed to load Google Sheet data: ${error?.message || 'Unknown error'}`, type: 'error' } }));
        }
      } finally {
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent('app:loading', { detail: { show: false } }));
        }
      }
    };

    loadAppData();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isConfigured, hasLoadedData, hasCredentials, updateState, getAppState]);

  if (!isConfigured) {
    return <Setup />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="flex h-screen bg-slate-100 font-sans">

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent">
        <Routes>
          <Route path="/" element={<Dashboard onMenuClick={toggleSidebar} />} />
          <Route path="/projects" element={<Projects onMenuClick={toggleSidebar} />} />
          <Route path="/scanner" element={<PlotScanner onMenuClick={toggleSidebar} />} />
          <Route path="/formulations" element={<Formulations onMenuClick={toggleSidebar} />} />
          <Route path="/trials" element={<Trials onMenuClick={toggleSidebar} />} />
          <Route path="/reports" element={<Reports onMenuClick={toggleSidebar} />} />
          <Route path="/organisations" element={<Organisations onMenuClick={toggleSidebar} />} />
          <Route path="/ingredients" element={<Ingredients onMenuClick={toggleSidebar} />} />
          <Route path="/ai-assistant" element={<AIAssistant onMenuClick={toggleSidebar} />} />
          <Route path="/analytics" element={<Analytics onMenuClick={toggleSidebar} />} />
          <Route path="/statistics" element={<Statistics onMenuClick={toggleSidebar} />} />
          <Route path="/alerts" element={<Alerts onMenuClick={toggleSidebar} />} />
          <Route path="/dose-response" element={<DoseResponse onMenuClick={toggleSidebar} />} />
          <Route path="/resistance" element={<ResistanceTracker onMenuClick={toggleSidebar} />} />
          <Route path="/map" element={<FieldMap onMenuClick={toggleSidebar} />} />
          <Route path="/search" element={<SmartSearch onMenuClick={toggleSidebar} />} />
          <Route path="/data" element={<DataManagement onMenuClick={toggleSidebar} />} />
          <Route path="/settings" element={<Settings onMenuClick={toggleSidebar} />} />
          <Route path="/users" element={<UserManagement onMenuClick={toggleSidebar} />} />
          <Route path="/compare" element={<CompareTrials onMenuClick={toggleSidebar} />} />
          <Route path="/migration" element={<MigrationTool onMenuClick={toggleSidebar} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

      </main>

      <BottomNav onMoreClick={toggleSidebar} />
      <Toast />
      <LoadingOverlay />
    </div>
  );
}


// Platform adapter for Web (React DOM)
function WebPlatformAdapter({ children }) {
  const { updateState } = useAppState();

  React.useEffect(() => {
    // Setup the platform adapter methods in global state for hooks/services to use
    updateState({
      isOnline: navigator.onLine,
      platformAdapter: {
        showToast: (msg, type) => window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } })),
        showLoading: (show) => window.dispatchEvent(new CustomEvent('app:loading', { detail: { show } })),
        renderSyncStatus: () => window.dispatchEvent(new CustomEvent('app:sync-status-update'))
      }
    });

    const handleOnline = () => {
      updateState({ isOnline: true });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Back online! Syncing data...', type: 'info' } }));
    };

    const handleOffline = () => {
      updateState({ isOnline: false });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Offline Mode Active', type: 'info' } }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updateState]);

  return children;
}

function App() {
  return (
    <AppStateProvider>
      <HashRouter>
        <Routes>
          {/* Public live QR page — no auth required */}
          <Route path="/live/:id" element={<LiveTrialPage />} />
          {/* All authenticated app routes */}
          <Route path="/*" element={<WebPlatformAdapter><AppLayout /></WebPlatformAdapter>} />
        </Routes>
      </HashRouter>
    </AppStateProvider>
  );
}

export default App;
