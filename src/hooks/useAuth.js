import { useCallback } from 'react';
import { useAppState } from './useAppState.jsx';
import { loginUser } from '../services/db.js';
import { fbLogin, fbLogout } from '../services/firebaseAuth.js';
import { initFirebase, isFirebaseReady } from '../services/firebase.js';

export function useAuth() {
  const { state, dispatch, getAppState } = useAppState();

  const login = useCallback(async (username, password) => {
    const settings = getAppState().settings;
    const useFirebase = settings?.firebaseEnabled;

    if (useFirebase) {
      // Ensure Firebase is initialized (in case it wasn't auto-inited yet)
      if (!isFirebaseReady()) {
        try {
          initFirebase(settings.firebaseConfig);
        } catch (err) {
          return { success: false, message: 'Firebase not configured properly: ' + err.message };
        }
      }

      const result = await fbLogin(username, password);
      if (result.success) {
        const user = result.user;
        const role = String(user?.Role || user?.role || 'user').toLowerCase();
        dispatch({
          type: 'SET_AUTH',
          payload: {
            user: { ...user, role },
            token: result.token,
            uid: result.uid,
            username,
            authProvider: 'firebase',
          }
        });
        return { success: true, user };
      }
      return result;
    }

    // ── Legacy Google Sheet auth ──────────────────────────────────────────────
    try {
      const response = await loginUser({ username, password }, getAppState);
      const userData = response?.user || response;
      const tokenValue = response?.token || response?.Token || response?.user?.token || response?.user?.Token || username;

      if (userData && (userData.ID || userData.Username || userData.username)) {
        dispatch({
          type: 'SET_AUTH',
          payload: { user: userData, token: tokenValue, username, password, authProvider: 'sheet' }
        });
        return { success: true, user: userData };
      }
      return { success: false, message: response?.message || 'Login failed' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }, [dispatch, getAppState]);

  const logout = useCallback(async () => {
    const authProvider = state.auth?.authProvider;
    if (authProvider === 'firebase') {
      try { await fbLogout(); } catch (_) {}
    }
    dispatch({ type: 'LOGOUT' });
  }, [dispatch, state.auth]);

  const user = state.auth?.user;
  const roleRaw = String(user?.Role || user?.role || '').toLowerCase();
  const isAdmin = roleRaw === 'admin';
  const isAuthenticated = !!user && !!state.auth?.token;

  return {
    user,
    token: state.auth?.token,
    isAuthenticated,
    isAdmin,
    login,
    logout
  };
}
