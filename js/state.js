// ═══════════════════════════════════════════════════════════
// state.js — shared reactive store for the Oasis Admin console
// Replaces app.js's global vars (allSessions, allUsers, etc.)
// and the manual DOM-update functions with Vue reactivity.
// ═══════════════════════════════════════════════════════════
import { reactive } from './vue.js';

/* ── Firebase config (same project as the main Oasis app) ── */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDLdoWCGmuwEwuPLwijnoRyRP7sWtGc-Qc",
  authDomain:        "nutri-track-pro-c11c5.firebaseapp.com",
  databaseURL:       "https://nutri-track-pro-c11c5-default-rtdb.firebaseio.com",
  projectId:         "nutri-track-pro-c11c5",
  storageBucket:     "nutri-track-pro-c11c5.firebasestorage.app",
  messagingSenderId: "1046053514584",
  appId:             "1:1046053514584:web:5c62ac3d857a890d17c92d",
  measurementId:     "G-4H706WPSP0"
};

if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
export const auth = firebase.auth();

let db = null;
let rtdb = null;
let fsUnsubs = [];

/* ── Reactive app state (single source of truth for all components) ── */
export const store = reactive({
  currentUser: null,      // Firebase user object, or null when signed out
  currentTab: 'home',     // replaces switchTab()'s DOM class toggling
  dbStatus: 'connecting', // 'connecting' | 'ok' | 'error'

  allSessions: [],
  allUsers: [],
  allCalculations: [],
  allFeedback: [],
  allPresence: [],
  globalStats: {},

  loginError: '',
  loginBusy: false,
});

let _rtdbPresence = {};

/* ── Derived KPIs (computed on demand — no manual _set() calls needed) ── */
export function homeStats() {
  const s = store;
  const active = s.allPresence.filter(p => p.state === 'online' || p.online === true).length;
  const institutions = new Set(s.allSessions.map(x => x.institution).filter(Boolean));
  return {
    totalSessions:  s.globalStats.totalSessions ?? s.allSessions.length,
    nowOnline:      active,
    totalCalcs:     s.globalStats.totalCalculations ?? s.allCalculations.length,
    feedbackCount:  s.allFeedback.length,
    institutions:   institutions.size,
    totalAccounts:  s.globalStats.totalAccounts ?? s.allUsers.length,
    newAccounts24h: s.globalStats.newAccounts24h ?? 0,
  };
}

/* ── Auth ── */
export async function doLogin(email, pass) {
  if (!email || !pass) {
    store.loginError = '⚠ Please enter your email and password.';
    return;
  }
  store.loginError = '';
  store.loginBusy = true;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    // onAuthStateChanged (below) handles the rest
  } catch (err) {
    const map = {
      'auth/invalid-email':          '✗ Invalid email address.',
      'auth/user-not-found':         '✗ No account found for this email.',
      'auth/wrong-password':         '✗ Incorrect password. Access denied.',
      'auth/invalid-credential':     '✗ Incorrect email or password. Access denied.',
      'auth/user-disabled':          '✗ This account has been disabled.',
      'auth/too-many-requests':      '⚠ Too many failed attempts. Try again later or reset your password.',
      'auth/network-request-failed': '⚠ Network error. Check your connection.',
    };
    store.loginError = map[err.code] || `✗ Authentication failed: ${err.message}`;
  } finally {
    store.loginBusy = false;
  }
}

export async function doLogout() {
  try {
    await auth.signOut();
  } catch (e) {
    console.error('[Admin] Sign-out error:', e);
    location.reload();
  }
}

export async function doForgotPassword(email) {
  if (!email) {
    store.loginError = '⚠ Enter your email address above first.';
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    store.loginError = '✓ Password reset email sent. Check your inbox.';
  } catch (err) {
    store.loginError = `✗ ${err.message}`;
  }
}

async function ensureAdminRole(user) {
  try {
    await firebase.firestore().collection('adminRoles').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      role: 'admin',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.warn('[Admin] Could not write adminRole:', e);
  }
}

/* ── Firestore + RTDB listeners ── */
function attachFirestoreListeners() {
  fsUnsubs.push(
    db.collection('sessions').orderBy('startedAt', 'desc').limit(500)
      .onSnapshot(snap => {
        store.allSessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const seen = new Set();
        store.allUsers = store.allSessions
          .filter(s => s.userId && !seen.has(s.userId) && seen.add(s.userId))
          .map(s => ({ id: s.userId, userRole: s.userRole || '', userName: s.userName || '' }));
      }, err => { console.error('[Admin] sessions listener error:', err); store.dbStatus = 'error'; })
  );

  fsUnsubs.push(
    db.collection('calculations').orderBy('timestamp', 'desc').limit(500)
      .onSnapshot(snap => { store.allCalculations = snap.docs.map(d => ({ id: d.id, ...d.data() })); },
        err => console.warn('[Admin] calculations listener error:', err))
  );

  fsUnsubs.push(
    db.collection('feedback').orderBy('sentAt', 'desc').limit(200)
      .onSnapshot(snap => { store.allFeedback = snap.docs.map(d => ({ id: d.id, ...d.data() })); },
        err => console.warn('[Admin] feedback listener error:', err))
  );

  fsUnsubs.push(
    db.collection('presence').onSnapshot(snap => {
      store.allPresence = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      mergeRTDBPresence();
    }, err => console.warn('[Admin] presence listener error:', err))
  );

  db.collection('stats').doc('global').onSnapshot(snap => {
    if (snap.exists) store.globalStats = snap.data() || {};
  }, err => console.warn('[Admin] stats listener error:', err));

  setTimeout(() => {
    if (store.dbStatus === 'connecting') {
      store.dbStatus = 'error';
      console.error('[Admin] Firestore connection timeout after 12s');
    }
  }, 12000);
}

function attachRTDBListeners() {
  if (!rtdb) return;
  rtdb.ref('/presence').on('value', snap => {
    _rtdbPresence = snap.val() || {};
    mergeRTDBPresence();
  }, err => console.warn('[Admin] RTDB presence listener error:', err));
}

function mergeRTDBPresence() {
  // Overlay RTDB's instant onDisconnect state onto the Firestore-sourced list.
  const byId = new Map(store.allPresence.map(p => [p.id, p]));
  for (const [id, v] of Object.entries(_rtdbPresence)) {
    if (v?.state === 'offline') { byId.delete(id); continue; }
    byId.set(id, { ...(byId.get(id) || {}), id, state: 'online', ...v });
  }
  store.allPresence = Array.from(byId.values());
}

function initFirestoreListeners() {
  store.dbStatus = 'connecting';
  try {
    db = firebase.firestore();
    rtdb = firebase.database();
    attachRTDBListeners();
  } catch (err) {
    console.error('[Admin] Firebase init failed:', err);
    store.dbStatus = 'error';
    return;
  }
  attachFirestoreListeners();
  store.dbStatus = 'ok';
}

/* ── Auth state is the single source of truth for routing ── */
auth.onAuthStateChanged(async (user) => {
  store.currentUser = user;
  if (user) {
    if (!db) initFirestoreListeners();
    await ensureAdminRole(user);
    console.log(`[Admin] Signed in as ${user.email}`);
  } else {
    fsUnsubs.forEach(u => { try { u(); } catch (_) {} });
    fsUnsubs = [];
    db = null;
  }
});

/* ── Sessions actions ── */
export async function deleteSession(docId) {
  if (!docId || !db) return;
  await db.collection('sessions').doc(docId).delete();
  store.allSessions = store.allSessions.filter(s => s.id !== docId);
}

export async function deleteSessionsBulk(targets) {
  if (!targets.length || !db) return { ok: 0, fail: 0 };
  let ok = 0, fail = 0;
  const BATCH_SIZE = 400;
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const chunk = targets.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(s => batch.delete(db.collection('sessions').doc(s.id)));
    try { await batch.commit(); ok += chunk.length; } catch (e) { fail += chunk.length; }
  }
  store.allSessions = store.allSessions.filter(s => !targets.find(t => t.id === s.id));
  return { ok, fail };
}

/* ── Feedback actions ── */
export async function deleteFeedback(docId) {
  if (!docId || !db) return;
  await db.collection('feedback').doc(docId).delete();
  store.allFeedback = store.allFeedback.filter(f => f.id !== docId);
}

export async function deleteAllFeedback() {
  if (!store.allFeedback.length || !db) return { ok: 0, fail: 0 };
  let ok = 0, fail = 0;
  const BATCH_SIZE = 400;
  const targets = [...store.allFeedback];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const chunk = targets.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(f => batch.delete(db.collection('feedback').doc(f.id)));
    try { await batch.commit(); ok += chunk.length; } catch (e) { fail += chunk.length; }
  }
  store.allFeedback = store.allFeedback.filter(f => !targets.find(t => t.id === f.id));
  return { ok, fail };
}

export async function sendAdminReply(docId, replyText) {
  if (!replyText.trim() || !db) return;
  const adminName = auth.currentUser?.displayName || 'Admin';
  await db.collection('feedback').doc(docId).update({
    adminReply: {
      message: replyText.trim(),
      repliedAt: firebase.firestore.FieldValue.serverTimestamp(),
      adminName,
    },
    replyRead: false,
  });
  // local optimistic update (onSnapshot will also refresh it)
  const f = store.allFeedback.find(x => x.id === docId);
  if (f) f.adminReply = { message: replyText.trim(), adminName };
}

/* ── User role overrides ── */
export const userRoleOverrides = reactive({});

export async function saveUserRole(userId, role) {
  userRoleOverrides[userId] = role;
  if (db) {
    try {
      await db.collection('userRoles').doc(userId).set({ role, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      return { ok: true, persisted: true };
    } catch (e) { return { ok: true, persisted: false }; }
  }
  return { ok: true, persisted: false };
}

export function switchTab(tab) {
  store.currentTab = tab;
}

/* ── Push a client release (Home panel "Client Release" card) ── */
export const pushLog = reactive({ lines: ['Ready. Enter version + notes then push.'], busy: false });

export async function pushUpdateToClients(version, notes) {
  version = (version || '').trim();
  notes = (notes || '').trim();
  pushLog.lines = [];
  const log = (m) => pushLog.lines.push(m);

  if (!version) { log('✕ Version number is required (e.g. 1.2.2).'); return; }
  pushLog.busy = true;
  log('⏳ Pushing update signal…');

  const payload = {
    version,
    notes: notes || '—',
    releasedAt: new Date().toISOString(),
    pushedBy: 'Oasis Admin Dashboard',
  };

  let firestoreOk = false, broadcastOk = false, rtdbOk = false;

  if (db) {
    try {
      await db.collection('system').doc('app_version').set(payload);
      firestoreOk = true;
      log('✓ Firestore · system/app_version updated.');
    } catch (err) { log('✕ Firestore write failed: ' + err.message); }
  } else {
    log('⚠ Firestore offline — skipped (will retry on reconnect).');
  }

  try {
    const bc = new BroadcastChannel('ntp-pwa-update');
    bc.postMessage({ type: 'UPDATE_AVAILABLE', ...payload });
    bc.close();
    broadcastOk = true;
    log('✓ BroadcastChannel · signal sent to open Oasis tabs.');
  } catch (err) { log('⚠ BroadcastChannel not supported: ' + err.message); }

  if (rtdb) {
    try {
      await rtdb.ref('/system/app_version').set({ ...payload, pushedAt: firebase.database.ServerValue.TIMESTAMP });
      rtdbOk = true;
      log('✓ RTDB · /system/app_version updated — main app listeners will fire instantly.');
    } catch (err) { log('⚠ RTDB write failed: ' + err.message); }
  } else {
    log('⚠ RTDB offline — channel C skipped.');
  }

  if (firestoreOk || broadcastOk || rtdbOk) {
    const channels = [firestoreOk && 'Firestore', broadcastOk && 'BroadcastChannel', rtdbOk && 'RTDB'].filter(Boolean).join(' + ');
    log(`✓ Update v${version} pushed via ${channels}. Oasis clients will prompt users on next load or tab focus.`);
  } else {
    log('✕ Update push failed on all channels.');
  }
  pushLog.busy = false;
}
