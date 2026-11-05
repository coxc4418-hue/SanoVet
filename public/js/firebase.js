// SanoVet — Inicialización de Firebase (App, Auth, Firestore, Analytics)
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider, setPersistence,
  browserLocalPersistence, signInAnonymously, createUserWithEmailAndPassword, inMemoryPersistence
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager,
  memoryLocalCache, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  onSnapshot, query, where, orderBy, limit, writeBatch, increment, serverTimestamp, documentId, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyBIITO5ZfyHDYbMtoe7Oa1kCemzdzi1_do',
  authDomain: 'sano-vet.firebaseapp.com',
  projectId: 'sano-vet',
  storageBucket: 'sano-vet.firebasestorage.app',
  messagingSenderId: '692430302777',
  appId: '1:692430302777:web:7285e198f848589434a7e8',
  measurementId: 'G-MSYF5D1B8E'
};

// Emuladores locales solo para pruebas (http://localhost:...?emu=1)
const useEmulators = ['localhost', '127.0.0.1'].includes(location.hostname) &&
  (new URLSearchParams(location.search).has('emu') || sessionStorage.getItem('sv_emu') === '1');
if (useEmulators) sessionStorage.setItem('sv_emu', '1');

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'es';

let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn('[SanoVet] Caché offline no disponible, usando memoria:', e);
  firestore = initializeFirestore(app, { localCache: memoryLocalCache() });
}
export const db = firestore;

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9799', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8780);
} else {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  // Analytics es opcional: nunca debe bloquear la app
  import('https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js')
    .then(async (m) => { if (await m.isSupported()) m.getAnalytics(app); })
    .catch(() => {});
}

/**
 * Crea una cuenta de Firebase Auth sin cerrar la sesión actual (usa una app secundaria temporal).
 * Devuelve el uid del nuevo usuario.
 */
export async function createAuthUser(email, password) {
  const sec = initializeApp(firebaseConfig, 'creator-' + Date.now());
  try {
    const a2 = getAuth(sec);
    await setPersistence(a2, inMemoryPersistence);
    if (useEmulators) connectAuthEmulator(a2, 'http://127.0.0.1:9799', { disableWarnings: true });
    const cred = await createUserWithEmailAndPassword(a2, email, password);
    const uid = cred.user.uid;
    await signOut(a2);
    return uid;
  } finally {
    await deleteApp(sec).catch(() => {});
  }
}

export {
  signInAnonymously, Timestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider,
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot,
  query, where, orderBy, limit, writeBatch, increment, serverTimestamp, documentId
};
