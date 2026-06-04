// src/services/firebaseAuth.js
// Firebase Authentication — email/password.
// Also syncs the user profile record in Firestore (COLLECTIONS.users).

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDB, COLLECTIONS } from './firebase.js';

// ─── helpers ────────────────────────────────────────────────────────────────

async function getUserProfile(uid) {
  const db = getFirebaseDB();
  const snap = await getDoc(doc(db, COLLECTIONS.users, uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

async function createUserProfile(uid, profileData) {
  const db = getFirebaseDB();

  // Auto-promote first user or admin emails to Admin
  let isFirstUser = false;
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.users));
    if (snap.empty) isFirstUser = true;
  } catch (e) {
    // If rules block listing users, we assume not first
  }

  const emailLower = (profileData.email || '').toLowerCase();
  const autoAdmin = isFirstUser || emailLower.includes('admin');

  const record = {
    ID: uid,
    Username: profileData.email,
    Name: profileData.name || profileData.displayName || profileData.email,
    Role: profileData.role || (autoAdmin ? 'Admin' : 'User'),
    IsActive: true,
    DriveFolderId: profileData.DriveFolderId || '',
    ApiKeysJSON: '[]',
    CreatedAt: new Date().toISOString(),
    UpdatedAt: new Date().toISOString(),
    _createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, COLLECTIONS.users, uid), record);
  return record;
}

// ─── Auth actions ────────────────────────────────────────────────────────────

/**
 * Sign in with email + password.
 * Returns { success, user, uid, token } or { success: false, message }.
 */
export async function fbLogin(email, password) {
  try {
    const auth = getFirebaseAuth();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const token = await cred.user.getIdToken();
    let profile = await getUserProfile(cred.user.uid);
    if (!profile) {
      profile = await createUserProfile(cred.user.uid, { email });
    }
    if (profile.IsActive === false) {
      await signOut(auth);
      throw new Error('Account is disabled. Contact administrator.');
    }
    return { success: true, user: { ...profile, uid: cred.user.uid }, uid: cred.user.uid, token };
  } catch (err) {
    const map = {
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/user-not-found': 'No account found with that email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/too-many-requests': 'Too many failed attempts. Please wait before retrying.',
      'auth/user-disabled': 'Account is disabled.',
    };
    return { success: false, message: map[err.code] || err.message };
  }
}

/**
 * Register a new user (admin action or first-time setup).
 * Creates both a Firebase Auth user and a Firestore profile document.
 */
export async function fbRegisterUser(email, password, profileData = {}) {
  try {
    const auth = getFirebaseAuth();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const profile = await createUserProfile(cred.user.uid, { email, ...profileData });
    return { success: true, uid: cred.user.uid, user: profile };
  } catch (err) {
    const map = {
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/invalid-email': 'Invalid email address.',
    };
    return { success: false, message: map[err.code] || err.message };
  }
}

export async function fbLogout() {
  const auth = getFirebaseAuth();
  await signOut(auth);
  return { success: true };
}

export async function fbResetPassword(email) {
  try {
    const auth = getFirebaseAuth();
    await sendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Get current Firebase Auth user token (refreshed).
 */
export async function fbGetCurrentToken() {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(true);
}

/**
 * Subscribe to auth state changes — returns an unsubscribe function.
 */
export function fbOnAuthStateChanged(callback) {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      const profile = await getUserProfile(fbUser.uid);
      const token = await fbUser.getIdToken();
      callback({ fbUser, profile, token });
    } else {
      callback(null);
    }
  });
}

// ─── User management (admin) ─────────────────────────────────────────────────

export async function fbGetAllUsers() {
  const db = getFirebaseDB();
  const snap = await getDocs(collection(db, COLLECTIONS.users));
  return snap.docs.map(d => {
    const data = d.data();
    const { Password, ...safe } = data;
    return { uid: d.id, ...safe };
  });
}

export async function fbUpdateUserProfile(uid, updates) {
  const db = getFirebaseDB();
  await updateDoc(doc(db, COLLECTIONS.users, uid), {
    ...updates,
    UpdatedAt: new Date().toISOString(),
    _updatedAt: serverTimestamp(),
  });
  return { success: true, uid };
}

export async function fbGetUserProfile(uid) {
  return getUserProfile(uid);
}
