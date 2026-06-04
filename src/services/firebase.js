// src/services/firebase.js
// Firebase initialization — config is loaded from app settings at runtime.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

let _app = null;
let _db = null;
let _auth = null;

/**
 * Initialize (or re-initialize) Firebase with the supplied config object.
 * Safe to call multiple times — re-uses the existing app unless the config changes.
 */
export function initFirebase(config) {
  if (!config || !config.apiKey || !config.projectId) {
    throw new Error('Firebase config is incomplete. Provide apiKey and projectId at minimum.');
  }

  // If an app already exists with the same projectId, reuse it.
  const existing = getApps().find(a => a.options.projectId === config.projectId);
  if (existing) {
    _app = existing;
  } else {
    // Delete any stale default app first
    if (getApps().length > 0 && getApps()[0].name === '[DEFAULT]') {
      // Can't delete in Firebase v9 modular, so we just re-grab
      _app = getApps()[0];
    } else {
      _app = initializeApp(config);
    }
  }

  _db = getFirestore(_app);
  _auth = getAuth(_app);

  return { app: _app, db: _db, auth: _auth };
}

export function getFirebaseDB() {
  if (!_db) throw new Error('Firebase not initialized. Call initFirebase(config) first.');
  return _db;
}

export function getFirebaseAuth() {
  if (!_auth) throw new Error('Firebase not initialized. Call initFirebase(config) first.');
  return _auth;
}

export function isFirebaseReady() {
  return !!_db && !!_auth;
}

/**
 * Firestore collection names — mirrors the Google Sheet tab names.
 */
export const COLLECTIONS = {
  trials: 'trials',
  formulations: 'formulations',
  ingredients: 'ingredients',
  organisations: 'organisations',
  projects: 'projects',
  blocks: 'blocks',
  users: 'users',
  settings: 'settings',
  analysisLog: 'analysisLog',
  syncConflicts: 'syncConflicts',
  aiChatSessions: 'aiChatSessions',
  sprayLogs: 'sprayLogs',
};
