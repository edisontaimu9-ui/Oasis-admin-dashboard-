'use strict';

/* ═══════════════════════════════════════════════════════════
   COPY / PASTE RESTRICTION
   Blocks clipboard read/write across the admin console.
   Input fields are exempt so the user can still type.
═══════════════════════════════════════════════════════════ */
(function _lockClipboard() {
  const ALLOWED_TAGS = new Set(['INPUT', 'TEXTAREA']);
  const _isInputTarget = e => ALLOWED_TAGS.has(e.target?.tagName) || e.target?.isContentEditable;

  document.addEventListener('copy',  e => { if (!_isInputTarget(e)) { e.preventDefault(); e.clipboardData?.clearData(); } }, true);
  document.addEventListener('cut',   e => { if (!_isInputTarget(e)) { e.preventDefault(); e.clipboardData?.clearData(); } }, true);
  document.addEventListener('paste', e => { if (!_isInputTarget(e)) { e.preventDefault(); } }, true);

  // Block Ctrl/Cmd+C, Ctrl/Cmd+X, Ctrl/Cmd+V on non-input elements
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['c','x','v'].includes(e.key.toLowerCase())) {
      if (!_isInputTarget(e)) { e.preventDefault(); e.stopPropagation(); }
    }
  }, true);
})();

/* ═══════════════════════════════════════════════════════════
   FIREBASE — Oasis project (nutri-track-pro-c11c5)
   Same credentials as the main app.
═══════════════════════════════════════════════════════════ */
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

/** Global Firestore instance — set by initFirestoreListeners() */
let db = null;

/** Global Realtime Database instance — set by initFirestoreListeners() */
let rtdb = null;

/**
 * In-memory mirror of /presence in RTDB.
 * Keyed by presence node ID (same _pid used by main app).
 * Used to augment allPresence with accurate online/offline state.
 */
let _rtdbPresence = {};

/* ═══════════════════════════════════════════════════════════
   FIREBASE INIT — initialised once at page load.
   Auth state drives all routing (no hard-coded credentials).
═══════════════════════════════════════════════════════════ */
if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}
const _auth = firebase.auth();

/* ── PASSWORD STRENGTH EVALUATOR ── */
function evalPwdStrength(val) {
  const fill = document.getElementById('pwd-strength-fill');
  const hint = document.getElementById('pwd-strength-hint');
  if (!val) { fill.style.width='0'; hint.textContent='Enter a new password'; hint.style.color=''; return; }
  let score = 0;
  if (val.length >= 8)  score++;
  if (val.length >= 12) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const levels = [
    { w:'20%', bg:'#fb7185', txt:'Weak' },
    { w:'40%', bg:'#fb7185', txt:'Weak' },
    { w:'60%', bg:'#f0b429', txt:'Fair' },
    { w:'80%', bg:'#60a5fa', txt:'Good' },
    { w:'100%',bg:'#34d399', txt:'Strong' },
  ];
  const lv = levels[Math.min(score,5) - 1] || levels[0];
  fill.style.width = lv.w; fill.style.background = lv.bg;
  hint.textContent = lv.txt; hint.style.color = lv.bg;
}

/* ── CHANGE ADMIN PASSWORD (Firebase) ── */
async function changeAdminPassword() {
  const cur     = document.getElementById('pwd-current').value.trim();
  const newPwd  = document.getElementById('pwd-new').value;
  const confirm = document.getElementById('pwd-confirm').value;
  const msg     = document.getElementById('pwd-msg');
  msg.style.color = 'var(--red)';

  if (!cur || !newPwd || !confirm) { msg.textContent = '⚠ All fields are required.'; return; }
  if (newPwd.length < 8)           { msg.textContent = '⚠ Minimum 8 characters required.'; return; }
  if (newPwd !== confirm)          { msg.textContent = '✗ New passwords do not match.'; return; }
  if (cur === newPwd)              { msg.textContent = '⚠ New password must differ from current.'; return; }

  const user = _auth.currentUser;
  if (!user) { msg.textContent = '✗ Not authenticated. Please log in again.'; return; }

  try {
    // Re-authenticate with current password before updating
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, cur);
    await user.reauthenticateWithCredential(credential);
    await user.updatePassword(newPwd);

    ['pwd-current','pwd-new','pwd-confirm'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('pwd-strength-fill').style.width = '0';
    document.getElementById('pwd-strength-hint').textContent = 'Enter a new password';
    document.getElementById('pwd-strength-hint').style.color = '';
    msg.style.color = 'var(--green)';
    msg.textContent = '✓ Password updated successfully.';
    showToast('Admin password updated', 'success');
    setTimeout(() => { msg.textContent = ''; }, 4000);
  } catch (err) {
    const map = {
      'auth/wrong-password':        '✗ Current password is incorrect.',
      'auth/invalid-credential':    '✗ Current password is incorrect.',
      'auth/weak-password':         '⚠ New password is too weak (min 6 chars).',
      'auth/requires-recent-login': '⚠ Session expired — please log out and log in again.',
      'auth/too-many-requests':     '⚠ Too many attempts. Try again later.',
    };
    msg.textContent = map[err.code] || `✗ Error: ${err.message}`;
  }
}

/* ═══════════════════════════════════════════════════════════
   GLOBAL STATE — Firestore real-time listeners
═══════════════════════════════════════════════════════════ */
let allSessions     = [];
let allPresence     = [];
let allCalculations = [];
let allFeedback     = [];
let allUsers        = [];
let globalStats     = {};

let _sessionSearch = '';
let _charts        = {};   // Chart.js instances, keyed by canvas id
window._charts     = _charts;  // Shared reference — orientation_manager resizes on rotation

const TODAY = new Date().toISOString().slice(0, 10);

/* ═══════════════════════════════════════════════════════════
   CHART DEFAULTS
═══════════════════════════════════════════════════════════ */
const CHART_COLORS = ['#1de9d4','#f0b429','#60a5fa','#34d399','#a78bfa','#fb7185','#fbbf24','#38bdf8'];
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#6b82a0', font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 10 } },
    tooltip: { backgroundColor: '#080f1e', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, titleColor: '#c8d8f0', bodyColor: '#6b82a0', titleFont: { family: 'JetBrains Mono' }, bodyFont: { family: 'JetBrains Mono', size: 10 } }
  }
};

/* ═══════════════════════════════════════════════════════════
   CHART HELPERS
═══════════════════════════════════════════════════════════ */
function makeChart(id, cfg) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  const ctx = document.getElementById(id);
  if (!ctx) return;
  _charts[id] = new Chart(ctx, cfg);
}

/* ═══════════════════════════════════════════════════════════
   AUTH — Firebase Email/Password
═══════════════════════════════════════════════════════════ */

/** Show login screen, hide app */
function _showLoginScreen() {
  const ls  = document.getElementById('login-screen');
  const app = document.getElementById('app');
  if (ls)  { ls.style.display  = 'flex'; }
  if (app) { app.style.display = 'none'; }
}

/** Hide login screen, show app */
function _showApp() {
  const ls  = document.getElementById('login-screen');
  const app = document.getElementById('app');
  if (ls)  { ls.style.display  = 'none'; }
  if (app) { app.style.display = 'flex'; }
}

/** Assign / refresh admin role in Firestore */
async function _ensureAdminRole(user) {
  if (!db) return;
  try {
    await db.collection('adminRoles').doc(user.uid).set({
      uid:       user.uid,
      email:     user.email,
      role:      'admin',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.warn('[Admin] Could not write adminRole:', e);
  }
}

/** Firebase Email/Password sign-in */
async function doLogin() {
  const email = (document.getElementById('login-email')?.value || '').trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-err');
  const btn   = document.getElementById('login-btn');

  if (!email || !pass) {
    errEl.textContent = '⚠ Please enter your email and password.';
    return;
  }

  errEl.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = 'Authenticating…'; }

  try {
    await _auth.signInWithEmailAndPassword(email, pass);
    // onAuthStateChanged handles the rest
  } catch (err) {
    const map = {
      'auth/invalid-email':      '✗ Invalid email address.',
      'auth/user-not-found':     '✗ No account found for this email.',
      'auth/wrong-password':     '✗ Incorrect password. Access denied.',
      'auth/invalid-credential': '✗ Incorrect email or password. Access denied.',
      'auth/user-disabled':      '✗ This account has been disabled.',
      'auth/too-many-requests':  '⚠ Too many failed attempts. Try again later or reset your password.',
      'auth/network-request-failed': '⚠ Network error. Check your connection.',
    };
    errEl.textContent = map[err.code] || `✗ Authentication failed: ${err.message}`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'AUTHENTICATE →'; }
  }
}

/** Firebase sign-out */
async function doLogout() {
  try {
    await _auth.signOut();
    // onAuthStateChanged will redirect to login screen
  } catch (e) {
    console.error('[Admin] Sign-out error:', e);
    location.reload();
  }
}

/** Firebase password reset email */
async function doForgotPassword() {
  const email  = (document.getElementById('login-email')?.value || '').trim();
  const errEl  = document.getElementById('login-err');
  if (!email) {
    errEl.style.color = 'var(--amber, #f0b429)';
    errEl.textContent = '⚠ Enter your email address above first.';
    setTimeout(() => { errEl.textContent = ''; errEl.style.color = ''; }, 4000);
    return;
  }
  try {
    await _auth.sendPasswordResetEmail(email);
    errEl.style.color = 'var(--green, #34d399)';
    errEl.textContent = '✓ Password reset email sent. Check your inbox.';
    setTimeout(() => { errEl.textContent = ''; errEl.style.color = ''; }, 6000);
  } catch (err) {
    errEl.style.color = '';
    const map = {
      'auth/invalid-email':  '✗ Invalid email address.',
      'auth/user-not-found': '✗ No account found for this email.',
    };
    errEl.textContent = map[err.code] || `✗ Error: ${err.message}`;
  }
}

/* ═══════════════════════════════════════════════════════════
   FIRESTORE DATA INIT — real-time listeners on all collections
   Falls back to demo seed data if Firestore is unavailable
   or the collections are empty on first boot.
═══════════════════════════════════════════════════════════ */

/** Unsubscribe handles — stored so we can detach on logout if needed */
const _fsUnsubs = [];

/** Track how many listeners have fired at least once */
let _fsReady = 0;
const _FS_LISTENER_COUNT = 4; // sessions, calculations, feedback, presence

function _fullRender() {
  _updateSessionsKPIs();
  _updatePresenceKPIs();
  _updateUsersCount();
  _updateStatsUI();
  _renderSessionsTable();
  _renderLiveUsersTable();
  _renderOnlineTab();
  _renderFeedback();
  _renderOverviewCharts();
  _renderAnalyticsCharts();
}

function initFirestoreListeners() {
  setDbStatus('connecting');

  try {
    db   = firebase.firestore();
    rtdb = firebase.database();
    console.log('[Admin] RTDB initialised — attaching presence listener');
    _attachRTDBListeners();
  } catch (err) {
    console.error('[Admin] Firebase init failed:', err);
    setDbStatus('error');
    _showConnectionError('Firebase failed to initialise. Check your network connection and try reloading.');
    return;
  }

  // ── Firestore listeners — protected by Firebase Auth rules ──
  console.log('[Admin] Attaching Firestore listeners');
  _attachFirestoreListeners();
}

function _attachFirestoreListeners() {

  // ── 1. SESSIONS — ordered newest-first, last 500 ─────────────
  _fsUnsubs.push(
    db.collection('sessions')
      .orderBy('startedAt', 'desc')
      .limit(500)
      .onSnapshot(snap => {
        allSessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Derive allUsers from unique userId values in sessions
        const seenUsers = new Set();
        allUsers = allSessions
          .filter(s => s.userId && !seenUsers.has(s.userId) && seenUsers.add(s.userId))
          .map(s => ({ id: s.userId, userRole: s.userRole || '', userName: s.userName || '' }));
        _onListenerReady();
      }, err => {
        console.error('[Admin] sessions listener error:', err);
        setDbStatus('error');
        _showConnectionError('Firestore connection lost: ' + err.message);
      })
  );

  // ── 2. CALCULATIONS — newest-first, last 500 ─────────────────
  _fsUnsubs.push(
    db.collection('calculations')
      .orderBy('timestamp', 'desc')
      .limit(500)
      .onSnapshot(snap => {
        allCalculations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _onListenerReady();
      }, err => console.warn('[Admin] calculations listener error:', err))
  );

  // ── 3. FEEDBACK — newest-first ────────────────────────────────
  _fsUnsubs.push(
    db.collection('feedback')
      .orderBy('sentAt', 'desc')
      .limit(200)
      .onSnapshot(snap => {
        allFeedback = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _onListenerReady();
        // Incremental render (feedback tab may already be open)
        _renderFeedback();
        _set('nb-feedback', allFeedback.length);
        _set('ttn-badge-feedback', allFeedback.length || '');
        _set('home-feedback-count', allFeedback.length);
      }, err => console.warn('[Admin] feedback listener error:', err))
  );

  // ── 4. PRESENCE — all docs (small collection, <50 entries) ────
  _fsUnsubs.push(
    db.collection('presence')
      .onSnapshot(snap => {
        allPresence = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _onListenerReady();
        // Update live-user badges immediately on every heartbeat
        _updatePresenceKPIs();
        _renderLiveUsersTable();
      }, err => console.warn('[Admin] presence listener error:', err))
  );

  // ── 5. STATS/GLOBAL — single aggregated document ──────────────
  db.collection('stats').doc('global')
    .onSnapshot(snap => {
      if (snap.exists) {
        globalStats = snap.data() || {};
        _updateStatsUI();
      }
    }, err => console.warn('[Admin] stats listener error:', err));

  // Connection watchdog: if no listener fires within 12s, show error (no fallback)
  setTimeout(() => {
    if (_fsReady < 1) {
      console.error('[Admin] Firestore connection timeout after 12s');
      setDbStatus('error');
      _showConnectionError('Could not reach Firestore after 12 seconds. Check network connectivity and Firebase project status.');
    }
  }, 12000);
}

/* ═══════════════════════════════════════════════════════════
   RTDB LISTENERS — presence (accurate state) + app_version
   Augments Firestore data with RTDB's onDisconnect-backed
   online/offline signals. RTDB updates are instant; Firestore
   heartbeats lag by up to 30s.
═══════════════════════════════════════════════════════════ */

function _attachRTDBListeners() {
  if (!rtdb) return;

  // ── 1. PRESENCE — /presence value listener ─────────────────
  // Fires on every write from any Oasis client (online / offline / heartbeat).
  // We merge these into allPresence so KPIs and the Live Users table
  // reflect RTDB's onDisconnect accuracy rather than Firestore polling lag.
  rtdb.ref('/presence').on('value', (snap) => {
    _rtdbPresence = snap.val() || {};
    _mergeRTDBPresence();
    _updatePresenceKPIs();
    _renderLiveUsersTable();
  }, (err) => {
    console.warn('[Admin] RTDB presence listener error:', err);
  });

  // ── 2. /system/app_version — confirm push reached RTDB ─────
  // Admin writes here in pushUpdateToNTP(); this read-back confirms (Oasis)
  // the RTDB write succeeded and logs the current live version.
  rtdb.ref('/system/app_version').on('value', (snap) => {
    const v = snap.val();
    if (v?.version) {
      console.log('[Admin] RTDB app_version confirmed:', v.version, '—', v.releasedAt);
    }
  });
}

/**
 * Merge _rtdbPresence into allPresence (Firestore-sourced array).
 *
 * Rules:
 *  - RTDB state='online' : upsert entry into allPresence (add if missing,
 *    update lastSeen + state on existing match).
 *  - RTDB state='offline': remove the matching entry from allPresence —
 *    the user has definitively disconnected (onDisconnect guarantee).
 *
 * Timestamp normalisation:
 *  RTDB last_changed is epoch ms (number).
 *  allPresence entries use Firestore Timestamp objects with .toDate().
 *  We wrap RTDB timestamps in a shim so _updatePresenceKPIs() and
 *  _renderLiveUsersTable() work without changes.
 */
function _mergeRTDBPresence() {
  const now = Date.now();

  Object.entries(_rtdbPresence).forEach(([pid, entry]) => {
    if (!entry) return;

    const isOnline = entry.state === 'online';

    // Find matching Firestore presence entry by pid, or by sessionId
    const idx = allPresence.findIndex(
      p => p.id === pid || p.userId === pid ||
          (entry.sessionId && p.sessionId === entry.sessionId)
    );

    if (!isOnline) {
      // onDisconnect fired — remove from live list
      if (idx !== -1) allPresence.splice(idx, 1);
      return;
    }

    // Shim: wrap RTDB numeric timestamp so existing code using .toDate() works
    const _ts_shim = (ms) => ({
      toDate: () => new Date(ms || now),
      _rtdb:  true,
    });

    const normalized = {
      id:             pid,
      userId:         pid,
      sessionId:      entry.sessionId      || pid,
      institution:    entry.institution    || '',
      institutionCat: entry.institutionCat || '',
      ward:           entry.ward           || '',
      activeModule:   entry.activeModule   || '',
      calcCount:      entry.calcCount      || 0,
      userName:       entry.userName       || '',
      userRole:       entry.userRole       || '',
      userUid:        entry.userUid        || '',
      deviceInfo:     entry.deviceInfo     || '',
      lastSeen:       _ts_shim(entry.last_changed),
      _fromRTDB:      true,
    };

    if (idx !== -1) {
      // Update existing entry — prefer RTDB's freshly-stamped lastSeen
      allPresence[idx] = { ...allPresence[idx], ...normalized };
    } else {
      // New RTDB-only entry (client registered before Firestore heartbeat fired)
      allPresence.push(normalized);
    }
  });
}

/** Called each time one of the main listeners fires for the first time */
function _onListenerReady() {
  _fsReady++;
  if (_fsReady === 1) {
    // First listener resolved — Firestore is live
    setDbStatus('firestore');
  }
  if (_fsReady >= _FS_LISTENER_COUNT) {
    // All listeners resolved — render with real data (collections may be empty on first use)
    _fullRender();
  } else {
    // Partial render while remaining listeners resolve
    _updateSessionsKPIs();
    _updatePresenceKPIs();
    _renderSessionsTable();
    _renderLiveUsersTable();
  }
}

/** Shows a persistent error banner when Firestore is unavailable — no local fallback */
function _showConnectionError(msg) {
  // Avoid duplicate banners
  if (document.getElementById('fs-error-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'fs-error-banner';
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:9999;
    background:linear-gradient(90deg,rgba(251,113,133,0.15),rgba(251,113,133,0.08));
    border-bottom:2px solid rgba(251,113,133,0.6);
    padding:10px 20px;display:flex;align-items:center;gap:12px;
    font-family:var(--mono);font-size:11px;color:#fb7185;
  `;
  banner.innerHTML = `
    <span style="font-size:16px">🔴</span>
    <span><strong>Firestore Unavailable</strong> — ${msg}</span>
    <button onclick="location.reload()" style="margin-left:auto;padding:4px 12px;background:rgba(251,113,133,0.2);border:1px solid rgba(251,113,133,0.5);color:#fb7185;border-radius:4px;font-family:var(--mono);font-size:10px;cursor:pointer">
      ↺ Retry
    </button>
  `;
  document.body.prepend(banner);
}

/* ── Demo seed data so dashboard isn't empty on first launch ── */
function _seedDemoData() {
  const now = Date.now();
  const DAY = 86400000;
  const institutions = ['QECH Blantyre','Mzuzu Central','KCH Lilongwe','Zomba Central','Nkhata Bay'];
  const modules = ['adult','pedi','tpn','enteral','renal','oncology'];
  const wards   = ['ICU','Ward 4A','Paeds','Oncology','Medical','Surgical'];

  allSessions = Array.from({ length: 38 }, (_, i) => ({
    id: 'ses_' + (1000 + i),
    sessionId: 'ses_' + (1000 + i),
    startedAt: { toDate: () => new Date(now - Math.random() * 14 * DAY) },
    date: new Date(now - i * 6 * 3600000).toISOString().slice(0, 10),
    institution: institutions[i % institutions.length],
    ward: wards[i % wards.length],
    lastModule: modules[i % modules.length],
    calcCount: Math.floor(Math.random() * 5) + 1,
    status: Math.random() > 0.2 ? 'complete' : 'in-progress',
    userName: 'User ' + (i + 1),
    userRole: i % 3 === 0 ? 'Dietitian' : i % 3 === 1 ? 'Clinician' : 'Nurse',
    userId: 'user_' + (100 + (i % 12)),
  }));

  allCalculations = Array.from({ length: 80 }, (_, i) => ({
    id: 'calc_' + i,
    module: modules[i % modules.length],
    calcType: modules[i % modules.length],
    diagnosis: ['Malnutrition','Cancer','Renal Failure','Critical Illness','Burns','HIV/AIDS'][i % 6],
    timestamp: { toDate: () => new Date(now - Math.random() * 7 * DAY) },
    userAgent: i % 3 === 0 ? 'Mozilla/5.0 (Android 11; Mobile)' : 'Mozilla/5.0 (Windows NT 10.0)',
  }));

  allPresence = Array.from({ length: 5 }, (_, i) => ({
    id: 'pres_' + i,
    sessionId: 'ses_' + (1000 + i),
    institution: institutions[i % institutions.length],
    ward: wards[i % wards.length],
    activeModule: modules[i % modules.length],
    lastSeen: { toDate: () => new Date(now - i * 60000) },
    deviceInfo: i % 2 === 0 ? 'Mozilla/5.0 (Android 11; Mobile)' : 'Mozilla/5.0 (Windows NT 10.0)',
  }));

  allFeedback = [
    { id: 'fb_1', emoji: '👍', message: 'Very helpful for ICU nutrition decisions.', sessionId: 'ses_1001', sentAt: { toDate: () => new Date(now - DAY) }, deviceInfo: 'Mobile' },
    { id: 'fb_2', emoji: '❤️', message: 'The pediatric module is excellent.', sessionId: 'ses_1003', sentAt: { toDate: () => new Date(now - 2*DAY) }, deviceInfo: 'Desktop' },
    { id: 'fb_3', emoji: '💡', message: 'Would love TPN auto-save feature.', sessionId: 'ses_1007', sentAt: { toDate: () => new Date(now - 3*DAY) }, deviceInfo: 'Mobile' },
    { id: 'fb_4', emoji: '🐛', message: 'Clock widget overlaps on small screens.', sessionId: 'ses_1012', sentAt: { toDate: () => new Date(now - 4*DAY) }, deviceInfo: 'Tablet' },
  ];

  allUsers = Array.from({ length: 12 }, (_, i) => ({
    id: 'user_' + (100 + i),
    userRole: i % 3 === 0 ? 'Dietitian' : i % 3 === 1 ? 'Clinician' : 'Nurse',
  }));

  globalStats = {
    totalCalcs: 312,
    module_adult: 98, module_pedi: 74, module_tpn: 55,
    module_enteral: 42, module_renal: 28, module_oncology: 15,
  };
}

/* ── DB status indicator ── */
function setDbStatus(state) {
  const dot  = document.getElementById('db-status-dot');
  const txt  = document.getElementById('db-status-txt');
  const pill = document.getElementById('db-status-pill');
  const sett = document.getElementById('set-db-status');
  const sbInfo = document.getElementById('sidebar-db-info');
  const sysBadge = document.getElementById('sys-badge-db');
  const sysDbTxt = document.getElementById('sys-db-txt');
  const sysBadgeStatus = document.getElementById('sys-badge-status');
  const sysStatusTxt = document.getElementById('sys-status-txt');

  if (state === 'firestore') {
    // ── Firestore connected ──
    if (dot) { dot.style.background = 'var(--teal)'; dot.style.boxShadow = '0 0 6px var(--teal)'; dot.style.animation = ''; }
    if (txt) txt.textContent = 'Firestore';
    if (pill) { pill.style.borderColor = 'rgba(29,233,212,0.4)'; pill.style.color = 'var(--teal)'; }
    if (sett) { sett.textContent = '● Firestore Live'; sett.className = 'badge badge-teal'; }
    if (sbInfo) sbInfo.innerHTML = '🔥 Firestore · Real-time<br>🛢 RTDB · Presence + Updates<br>🛡 Auth · Admin<br>📦 1.0.0 · Apr 2026 · Apr 2026';
    if (sysBadge) { sysBadge.className = 'sys-badge ok'; }
    if (sysDbTxt) sysDbTxt.textContent = 'Cloud Firestore';
    if (sysBadgeStatus) { sysBadgeStatus.className = 'sys-badge ok'; }
    if (sysStatusTxt) sysStatusTxt.textContent = 'Firestore Connected';
  } else if (state === 'connecting') {
    if (dot) { dot.style.background = 'var(--amber)'; dot.style.animation = 'pulse-dot 1s infinite'; }
    if (txt) txt.textContent = 'Connecting…';
    if (sett) { sett.textContent = '⏳ Connecting'; sett.className = 'badge badge-amber'; }
    if (sbInfo) sbInfo.innerHTML = '🔥 Firestore · Connecting…<br>🛡 Auth · Admin<br>📦 1.0.0 · Apr 2026 · Apr 2026';
    if (sysBadgeStatus && sysStatusTxt) { sysBadgeStatus.className = 'sys-badge warn'; sysStatusTxt.textContent = 'Connecting to Firestore…'; }
    if (sysBadge && sysDbTxt) { sysBadge.className = 'sys-badge warn'; sysDbTxt.textContent = 'Cloud Firestore'; }
  } else {
    // ── error ──
    if (dot) { dot.style.background = 'var(--red)'; dot.style.animation = ''; dot.style.boxShadow = '0 0 6px var(--red)'; }
    if (txt) txt.textContent = 'Error';
    if (pill) { pill.style.borderColor = 'rgba(251,113,133,0.4)'; pill.style.color = 'var(--red)'; }
    if (sett) { sett.textContent = '✗ Firestore Error'; sett.className = 'badge badge-red'; }
    if (sbInfo) sbInfo.innerHTML = '🔴 Firestore · Unavailable<br>🛡 Auth · Admin<br>📦 1.0.0 · Apr 2026 · Apr 2026';
    if (sysBadge) { sysBadge.className = 'sys-badge err'; }
    if (sysDbTxt) sysDbTxt.textContent = 'Firestore Error';
    if (sysBadgeStatus) { sysBadgeStatus.className = 'sys-badge err'; }
    if (sysStatusTxt) sysStatusTxt.textContent = 'Firestore Unavailable';
  }
}

/* ═══════════════════════════════════════════════════════════
   HELPER: timestamp to Date
═══════════════════════════════════════════════════════════ */
function _ts(doc) {
  const t = doc.startedAt || doc.timestamp || doc.sentAt || doc.lastSeen || doc.createdAt;
  if (!t) return new Date(0);
  return t.toDate ? t.toDate() : new Date(t);
}

function _fmtTs(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
       + ' · ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}

function _ago(ts) {
  if (!ts) return '—';
  const d  = ts.toDate ? ts.toDate() : new Date(ts);
  const s  = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 30)  return 'Just now';
  if (s < 120) return s + 's ago';
  const m  = Math.floor(s / 60);
  if (m < 60)  return m + ' min ago';
  const h  = Math.floor(m / 60);
  return h + 'h ago';
}

function _deviceIcon(ua) {
  if (!ua) return '❓';
  const u = ua.toLowerCase();
  if (/ipad|tablet/.test(u)) return '📲';
  if (/mobile|android|iphone/.test(u)) return '📱';
  return '🖥';
}

function _deviceLabel(ua) {
  if (!ua) return 'Unknown';
  const u = ua.toLowerCase();
  if (/ipad|tablet/.test(u)) return 'Tablet';
  if (/android/.test(u)) return 'Android';
  if (/iphone/.test(u)) return 'iOS';
  if (/firefox/.test(u)) return 'Desktop · Firefox';
  if (/edg/.test(u)) return 'Desktop · Edge';
  if (/chrome/.test(u)) return 'Desktop · Chrome';
  if (/safari/.test(u)) return 'Desktop · Safari';
  return 'Desktop';
}

function _calcBadgeClass(module) {
  const m = { adult:'blue', pedi:'purple', 'low-resource':'teal', blenderized:'teal', tpn:'amber', enteral:'green', oncology:'red', critical:'red', maternal:'green', renal:'blue' };
  return 'badge-' + (m[module] || 'dim');
}

/* ═══════════════════════════════════════════════════════════
   KPI UPDATERS
═══════════════════════════════════════════════════════════ */
function _set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _updateSessionsKPIs() {
  const total    = allSessions.length;
  const today    = allSessions.filter(s => s.date === TODAY).length;
  const weekAgo  = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const week     = allSessions.filter(s => _ts(s) >= weekAgo).length;
  const uniquePt = new Set(allSessions.map(s => s.userId || s.sessionId)).size;
  const instSet  = new Set(allSessions.map(s => s.institution).filter(Boolean));
  const instCount = instSet.size;

  _set('home-total-sessions',   total);
  _set('ov-total-sessions',     total);
  _set('ov-sessions-today',     today);
  _set('ov-sessions-week',      week);
  _set('ov-unique-patients',    uniquePt);
  _set('ov-institutions',       instCount);
  _set('home-institutions',     instCount);
  _set('sessions-count-label',  total + ' records');
  _set('sessions-count-badge',  total + ' total');
  _set('nb-sessions',           total);
  _set('ttn-badge-sessions',    total);

  // Registered accounts KPIs
  const totalAccounts = allUsers.length;
  const cutoff24h = new Date(Date.now() - 86_400_000);
  const newAccounts24h = allUsers.filter(u => {
    const s = allSessions.find(sess => sess.userId === u.id);
    if (!s) return false;
    return _ts(s) >= cutoff24h;
  }).length;
  _set('home-total-accounts',   totalAccounts);
  _set('home-new-accounts-24h', newAccounts24h || '0');
}

function _updatePresenceKPIs() {
  const now    = Date.now();
  const active = allPresence.filter(p => {
    const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
    return (now - ls) < 120_000; // within 2 min = "online"
  }).length;
  const m30 = allPresence.filter(p => {
    const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
    return (now - ls) < 1_800_000;
  }).length;
  const m60 = allPresence.filter(p => {
    const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
    return (now - ls) < 3_600_000;
  }).length;
  const h24 = allPresence.filter(p => {
    const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
    return (now - ls) < 86_400_000;
  }).length;

  _set('home-now-online',       active);
  _set('anl-now',               active);
  _set('anl-30m',               m30);
  _set('anl-60m',               m60);
  _set('anl-24h',               h24);
  _set('anl-now2',              active);
  _set('anl-30m2',              m30);
  _set('anl-60m2',              m60);
  _set('anl-24h2',              h24);
  _set('header-online-badge',   '👤 ' + active + ' Online');
  _set('live-count-badge',      '● ' + active + ' online');
  _set('live-count-badge2',     '● ' + active + ' online');
  _set('online-count-label',    active + ' online now');
  _set('nb-online',             active);
  _set('ttn-badge-online',      active);
}

function _updateUsersCount() {
  _set('set-users-count', allUsers.length);
}

function _updateStatsUI() {
  const total = globalStats.totalCalcs || 0;
  _set('home-total-calcs',  total);
  _set('set-total-calcs',   total);

  // Find top module from globalStats
  let topMod = '—', topCount = 0;
  for (const [k, v] of Object.entries(globalStats)) {
    if (k.startsWith('module_') && v > topCount) {
      topCount = v;
      topMod = k.replace('module_', '');
    }
  }
  _set('ov-top-calc',        topMod.charAt(0).toUpperCase() + topMod.slice(1));
  _set('ov-top-calc-sub',    topCount + ' calculations');
  _set('set-top-module',     topMod.charAt(0).toUpperCase() + topMod.slice(1));
  _set('set-top-module-sub', topCount + ' uses');
}

/* ═══════════════════════════════════════════════════════════
   LIVE USERS TABLE
═══════════════════════════════════════════════════════════ */
function _renderLiveUsersTable() {
  const tbody = document.getElementById('live-users-tbody');
  if (!tbody) return;
  const now = Date.now();
  const rows = allPresence
    .filter(p => {
      const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
      return (now - ls) < 300_000; // last 5 min
    })
    .sort((a, b) => {
      const tA = a.lastSeen?.toDate ? a.lastSeen.toDate().getTime() : 0;
      const tB = b.lastSeen?.toDate ? b.lastSeen.toDate().getTime() : 0;
      return tB - tA;
    });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">🟢</div>No active users right now</div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(p => {
    const ls  = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
    const age = now - ls;
    const isLive = age < 90_000;
    const dotColor = isLive ? 'var(--green)' : 'var(--amber)';
    return `<tr>
      <td><div class="live-dot-sm" style="background:${dotColor};${isLive?'':'animation:none'}"></div></td>
      <td style="color:var(--teal);font-size:10px">${(p.sessionId || p.userId || '—').slice(0,14)}</td>
      <td>${_deviceIcon(p.deviceInfo)} ${_deviceLabel(p.deviceInfo)}</td>
      <td>${p.institution || '—'}</td>
      <td>${p.ward || '—'}</td>
      <td><span class="badge badge-teal">${p.activeModule || '—'}</span></td>
      <td style="color:${isLive ? 'var(--green)' : 'var(--text-dim)'}">${_ago(p.lastSeen)}</td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   ONLINE TAB — separate render for the Online tab
═══════════════════════════════════════════════════════════ */
function _renderOnlineTab() {
  const now = Date.now();
  const active = allPresence.filter(p => {
    const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
    return (now - ls) < 120_000;
  }).length;
  const m30 = allPresence.filter(p => { const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0; return (now - ls) < 1_800_000; }).length;
  const m60 = allPresence.filter(p => { const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0; return (now - ls) < 3_600_000; }).length;
  const h24 = allPresence.filter(p => { const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0; return (now - ls) < 86_400_000; }).length;
  _set('anl-now2', active); _set('anl-30m2', m30); _set('anl-60m2', m60); _set('anl-24h2', h24);
  _set('online-count-label', active + ' online now');
  _set('live-count-badge2', '● ' + active + ' online');
  _set('nb-online', active);
  _set('ttn-badge-online', active);

  const tbody = document.getElementById('live-users-tbody2');
  if (!tbody) return;
  const rows = allPresence
    .filter(p => { const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0; return (now - ls) < 300_000; })
    .sort((a, b) => { const tA = a.lastSeen?.toDate ? a.lastSeen.toDate().getTime() : 0; const tB = b.lastSeen?.toDate ? b.lastSeen.toDate().getTime() : 0; return tB - tA; });
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">🟢</div>No active users right now</div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(p => {
    const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
    const age = now - ls;
    const isLive = age < 90_000;
    const dotColor = isLive ? 'var(--green)' : 'var(--amber)';
    return `<tr>
      <td><div class="live-dot-sm" style="background:${dotColor};${isLive?'':'animation:none'}"></div></td>
      <td style="color:var(--teal);font-size:10px">${(p.sessionId || p.userId || '—').slice(0,14)}</td>
      <td>${_deviceIcon(p.deviceInfo)} ${_deviceLabel(p.deviceInfo)}</td>
      <td>${p.institution || '—'}</td>
      <td>${p.ward || '—'}</td>
      <td><span class="badge badge-teal">${p.activeModule || '—'}</span></td>
      <td style="color:${isLive ? 'var(--green)' : 'var(--text-dim)'}">${_ago(p.lastSeen)}</td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   SESSIONS TABLE
═══════════════════════════════════════════════════════════ */
function _renderSessionsTable() {
  const tbody = document.getElementById('sessions-tbody');
  if (!tbody) return;
  const q = _sessionSearch.toLowerCase();
  const rows = allSessions.filter(s => {
    if (!q) return true;
    return (s.sessionId||'').toLowerCase().includes(q)
        || (s.institution||'').toLowerCase().includes(q)
        || (s.lastModule||'').toLowerCase().includes(q)
        || (s.ward||'').toLowerCase().includes(q)
        || (s.userName||'').toLowerCase().includes(q);
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">🔍</div>No sessions match your search</div></td></tr>`;
    return;
  }

  const statusBadge = s => {
    if (s.status === 'active') return `<span class="badge badge-green">Active</span>`;
    if (s.status === 'ended')  return `<span class="badge badge-dim">Ended</span>`;
    return `<span class="badge badge-amber">Unknown</span>`;
  };

  tbody.innerHTML = rows.slice(0, 200).map(s =>
    `<tr>
      <td style="white-space:nowrap">${_fmtTs(s.startedAt)}</td>
      <td style="color:var(--teal);font-size:10px">${(s.sessionId||'—').slice(0,16)}</td>
      <td>${s.ward || '—'}</td>
      <td>${s.institution || '—'}</td>
      <td>${s.lastModule ? `<span class="badge ${_calcBadgeClass(s.lastModule)}">${s.lastModule}</span>` : '—'}</td>
      <td style="text-align:center">${s.calcCount || 0}</td>
      <td>${statusBadge(s)}</td>
      <td style="font-size:10px;color:var(--text-dim)">${s.userName || '—'}</td>
      <td style="text-align:center"><button onclick="deleteSession('${s.id}')" title="Delete session" style="background:none;border:none;cursor:pointer;font-size:15px;opacity:.7;padding:2px 6px" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.7">🗑</button></td>
    </tr>`
  ).join('');
}

function filterSessions() {
  _sessionSearch = document.getElementById('session-search')?.value || '';
  _renderSessionsTable();
}

async function deleteSession(docId) {
  if (!docId) return;
  if (!confirm('Delete this session record? This cannot be undone.')) return;
  try {
    await db.collection('sessions').doc(docId).delete();
    allSessions = allSessions.filter(s => s.id !== docId);
    _renderSessionsTable();
    _updateSessionsKPIs();
    showToast('Session deleted.', 'success');
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
    console.error('[Admin] deleteSession:', e);
  }
}

async function deleteAllSessions() {
  const q = _sessionSearch.toLowerCase();
  const targets = q
    ? allSessions.filter(s =>
        (s.sessionId||'').toLowerCase().includes(q) ||
        (s.institution||'').toLowerCase().includes(q) ||
        (s.lastModule||'').toLowerCase().includes(q) ||
        (s.ward||'').toLowerCase().includes(q) ||
        (s.userName||'').toLowerCase().includes(q))
    : [...allSessions];
  if (!targets.length) return;
  const label = q ? `${targets.length} filtered session(s)` : `ALL ${targets.length} session(s)`;
  if (!confirm(`Permanently delete ${label}? This cannot be undone.`)) return;
  showToast(`Deleting ${targets.length} session(s)…`, 'info');
  let ok = 0, fail = 0;
  const BATCH_SIZE = 400;
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const chunk = targets.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(s => batch.delete(db.collection('sessions').doc(s.id)));
    try { await batch.commit(); ok += chunk.length; }
    catch (e) { fail += chunk.length; showToast('Batch error: ' + e.message, 'error'); }
  }
  allSessions = allSessions.filter(s => !targets.find(t => t.id === s.id));
  _renderSessionsTable();
  _updateSessionsKPIs();
  showToast(`Deleted ${ok} session(s)${fail ? ` · ${fail} failed` : ''}.`, fail ? 'error' : 'success');
}

async function deleteFeedback(docId) {
  if (!docId) return;
  try {
    await db.collection('feedback').doc(docId).delete();
    allFeedback = allFeedback.filter(f => f.id !== docId);
    _renderFeedback();
    showToast('Feedback dismissed.', 'success');
  } catch (e) {
    showToast('Dismiss failed: ' + e.message, 'error');
    console.error('[Admin] deleteFeedback:', e);
  }
}

async function deleteAllFeedback() {
  if (!allFeedback.length) return;
  if (!confirm(`Permanently delete ALL ${allFeedback.length} feedback submission(s)? This cannot be undone.`)) return;
  showToast(`Deleting ${allFeedback.length} feedback item(s)…`, 'info');
  let ok = 0, fail = 0;
  const BATCH_SIZE = 400;
  const targets = [...allFeedback];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const chunk = targets.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(f => batch.delete(db.collection('feedback').doc(f.id)));
    try { await batch.commit(); ok += chunk.length; }
    catch (e) { fail += chunk.length; showToast('Batch error: ' + e.message, 'error'); }
  }
  allFeedback = allFeedback.filter(f => !targets.find(t => t.id === f.id));
  _renderFeedback();
  showToast(`Deleted ${ok} feedback item(s)${fail ? ` · ${fail} failed` : ''}.`, fail ? 'error' : 'success');
}

/* ═══════════════════════════════════════════════════════════
   FEEDBACK
═══════════════════════════════════════════════════════════ */
function _renderFeedback() {
  const el = document.getElementById('fb-list');
  if (!el) return;

  _set('fb-count-label', allFeedback.length + ' total submissions');
  _set('nb-feedback',      allFeedback.length);
  _set('ttn-badge-feedback', allFeedback.length || '');
  _set('home-feedback-count', allFeedback.length);

  // Emoji counts
  const counts = { '👍':0, '❤️':0, '😐':0, '🐛':0, '💡':0, '⚕️':0, '💬':0 };
  allFeedback.forEach(f => { if (counts[f.emoji] !== undefined) counts[f.emoji]++; });
  _set('fb-emoji-thumbsup', counts['👍']);
  _set('fb-emoji-heart',    counts['❤️']);
  _set('fb-emoji-neutral',  counts['😐']);
  _set('fb-emoji-bug',      counts['🐛'] + counts['⚕️']); // Bug Report + Clinical Error
  _set('fb-emoji-idea',     counts['💡'] + counts['💬']); // Feature Request + General

  if (!allFeedback.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💬</div>No feedback yet</div>';
    return;
  }
  el.innerHTML = allFeedback.map(f => {
    const senderName = f.userName || f.userId || f.sessionId || '—';
    const senderRole = f.userRole ? `<span class="badge badge-dim" style="font-size:8px;padding:1px 6px">${_esc(f.userRole)}</span>` : '';
    const senderUid  = f.userId   ? `<span class="fb-meta-item" title="User ID">🪪 ${_esc(f.userId.slice(0,16))}</span>` : '';
    const typeLabel  = f.feedbackType ? `<span class="badge badge-dim" style="font-size:8px;padding:1px 6px;margin-left:2px">${_esc(f.feedbackType)}</span>` : '';
    const subjectLine = f.subject ? `<div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:3px;opacity:.85">${_esc(f.subject)}</div>` : '';
    // Device: only show icon when it's not unknown
    const devLabel = _deviceLabel(f.deviceInfo);
    const devDisplay = devLabel !== 'Unknown'
      ? `${_deviceIcon(f.deviceInfo)} ${devLabel}`
      : `<span style="color:var(--text-muted);font-size:9px">Device unknown</span>`;
    return `<div class="fb-card" id="fb-card-${f.id}" style="position:relative">
      <div class="fb-emoji">${f.emoji || '💬'}</div>
      <div class="fb-body">
        <div class="fb-sender" style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <span style="font-size:12px;font-weight:700;color:var(--text)">${_esc(senderName)}</span>
          ${senderRole}${typeLabel}
        </div>
        ${subjectLine}
        <div class="fb-msg">${_esc(f.message || '(no message)')}</div>
        <div class="fb-meta">
          ${senderUid}
          <span class="fb-meta-item">📋 ${(f.sessionId||'—').slice(0,14)}</span>
          <span class="fb-meta-item">${devDisplay}</span>
          <span class="fb-meta-item">🕐 ${_fmtTs(f.sentAt)}</span>
        </div>
      </div>
      <button onclick="deleteFeedback('${f.id}')" title="Delete this feedback" style="position:absolute;top:8px;right:8px;background:rgba(251,113,133,0.08);border:1px solid rgba(251,113,133,0.25);border-radius:6px;cursor:pointer;font-size:11px;color:var(--red);opacity:.7;padding:3px 8px;line-height:1;font-family:var(--mono);letter-spacing:.5px" onmouseover="this.style.opacity=1;this.style.background='rgba(251,113,133,0.18)'" onmouseout="this.style.opacity=.7;this.style.background='rgba(251,113,133,0.08)'">🗑 DEL</button>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   OVERVIEW CHARTS
═══════════════════════════════════════════════════════════ */
function _renderOverviewCharts() {
  _chartSessionsTrend();
  _chartCalcTypes();
  _chartInstitutions();
  _chartRoles();
}

function _chartSessionsTrend() {
  const labels = [], counts = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const n = new Date(d); n.setDate(n.getDate() + 1);
    labels.push(d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }));
    counts.push(allSessions.filter(s => { const t = _ts(s); return t >= d && t < n; }).length);
  }
  makeChart('chart-sessions-trend', {
    type: 'line',
    data: { labels, datasets: [{ label: 'Sessions', data: counts, borderColor: '#1de9d4', backgroundColor: 'rgba(29,233,212,0.06)', pointBackgroundColor: '#1de9d4', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3 }] },
    options: { ...CHART_DEFAULTS, scales: { x: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 8 } } }, y: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 9 } }, beginAtZero: true } } }
  });
}

function _chartCalcTypes() {
  const counts = {};
  allCalculations.forEach(c => { const t = c.module || c.calcType || 'adult'; counts[t] = (counts[t] || 0) + 1; });
  const labels = Object.keys(counts), data = Object.values(counts);
  if (!labels.length) return;
  makeChart('chart-calc-types', {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS.map(c => c + '30'), borderColor: CHART_COLORS, borderWidth: 2, hoverBackgroundColor: CHART_COLORS.map(c => c + '55') }] },
    options: { ...CHART_DEFAULTS, cutout: '62%' }
  });
}

function _chartInstitutions() {
  const counts = {};
  allSessions.forEach(s => { const h = s.institution || 'Unknown'; counts[h] = (counts[h] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!sorted.length) return;
  makeChart('chart-institutions', {
    type: 'bar',
    data: { labels: sorted.map(([k]) => k.length > 20 ? k.slice(0, 18) + '…' : k), datasets: [{ label: 'Sessions', data: sorted.map(([, v]) => v), backgroundColor: CHART_COLORS.map(c => c + '30'), borderColor: CHART_COLORS, borderWidth: 2, borderRadius: 4 }] },
    options: { ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }, scales: { x: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 7 }, maxRotation: 30 } }, y: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 9 } }, beginAtZero: true } } }
  });
}

function _chartRoles() {
  const counts = {};
  allUsers.forEach(u => { const r = u.userRole || 'Unknown'; counts[r] = (counts[r] || 0) + 1; });
  const labels = Object.keys(counts), data = Object.values(counts);
  if (!labels.length) return;
  makeChart('chart-roles', {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS.map(c => c + '30'), borderColor: CHART_COLORS, borderWidth: 2 }] },
    options: { ...CHART_DEFAULTS, cutout: '55%' }
  });
}

/* ═══════════════════════════════════════════════════════════
   ANALYTICS CHARTS
═══════════════════════════════════════════════════════════ */
function _renderAnalyticsCharts() {
  _chartHourly();
  _chartDevices();
  _chartDiagnoses();
  _chartHospitalUsage();
}

function _chartHourly() {
  const now = Date.now();
  const labels = [], counts = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now - i * 3600000); start.setMinutes(0, 0, 0);
    const end   = new Date(start.getTime() + 3600000);
    labels.push(start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    const count = allPresence.length
      ? allPresence.filter(p => { const t = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0; return t >= start.getTime() && t < end.getTime(); }).length
      : allSessions.filter(s => { const t = _ts(s).getTime(); return t >= start.getTime() && t < end.getTime(); }).length;
    counts.push(count);
  }
  makeChart('chart-hourly', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Activity', data: counts, backgroundColor: counts.map((_, i) => i === 11 ? 'rgba(52,211,153,0.6)' : 'rgba(29,233,212,0.12)'), borderColor: counts.map((_, i) => i === 11 ? '#34d399' : '#1de9d4'), borderWidth: 1, borderRadius: 4 }] },
    options: { ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }, scales: { x: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 8 } } }, y: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 9 } }, beginAtZero: true, stepSize: 1 } } }
  });
}

function _chartDevices() {
  const counts = { Mobile: 0, Desktop: 0, Tablet: 0, Unknown: 0 };
  [...allSessions, ...allPresence].forEach(s => {
    const ua = (s.userAgent || s.deviceInfo || '').toLowerCase();
    if (/ipad|tablet/.test(ua)) counts.Tablet++;
    else if (/mobile|android|iphone/.test(ua)) counts.Mobile++;
    else if (ua) counts.Desktop++;
    else counts.Unknown++;
  });
  const labels = Object.keys(counts).filter(k => counts[k] > 0);
  const data   = labels.map(k => counts[k]);
  if (!data.length) return;
  makeChart('chart-devices', {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: ['rgba(96,165,250,0.3)', 'rgba(29,233,212,0.3)', 'rgba(167,139,250,0.3)', 'rgba(100,130,160,0.3)'], borderColor: ['#60a5fa', '#1de9d4', '#a78bfa', '#3d5070'], borderWidth: 2 }] },
    options: { ...CHART_DEFAULTS, cutout: '60%' }
  });
}

function _chartDiagnoses() {
  const counts = {};
  allCalculations.forEach(c => { if (c.diagnosis) { counts[c.diagnosis] = (counts[c.diagnosis] || 0) + 1; } });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!sorted.length) return;
  makeChart('chart-diagnoses', {
    type: 'bar',
    data: { labels: sorted.map(([k]) => k.length > 22 ? k.slice(0, 20) + '…' : k), datasets: [{ label: 'Calcs', data: sorted.map(([, v]) => v), backgroundColor: 'rgba(240,180,41,0.15)', borderColor: '#f0b429', borderWidth: 2, borderRadius: 4 }] },
    options: { ...CHART_DEFAULTS, indexAxis: 'y', plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }, scales: { x: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 9 } }, beginAtZero: true }, y: { grid: { color: 'rgba(30,48,80,0.3)' }, ticks: { color: '#6b82a0', font: { family: 'JetBrains Mono', size: 8 } } } } }
  });
}

function _chartHospitalUsage() {
  const counts = {};
  allSessions.forEach(s => { const h = s.institution || 'Unknown'; counts[h] = (counts[h] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!sorted.length) return;
  makeChart('chart-hospital-usage', {
    type: 'bar',
    data: { labels: sorted.map(([k]) => k.length > 22 ? k.slice(0, 20) + '…' : k), datasets: [{ label: 'Sessions', data: sorted.map(([, v]) => v), backgroundColor: 'rgba(96,165,250,0.15)', borderColor: '#60a5fa', borderWidth: 2, borderRadius: 4 }] },
    options: { ...CHART_DEFAULTS, indexAxis: 'y', plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }, scales: { x: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 9 } }, beginAtZero: true }, y: { grid: { color: 'rgba(30,48,80,0.3)' }, ticks: { color: '#6b82a0', font: { family: 'JetBrains Mono', size: 8 } } } } }
  });
}

/* ═══════════════════════════════════════════════════════════
   CSV EXPORT
═══════════════════════════════════════════════════════════ */
function exportSessionsCSV() {
  const headers = ['Session ID','Date','Institution','Ward','Last Module','Calc Count','Status','User Name','User Role'];
  const rows = allSessions.map(s => [
    s.sessionId || '', _fmtTs(s.startedAt), s.institution || '', s.ward || '',
    s.lastModule || '', s.calcCount || 0, s.status || '', s.userName || '', s.userRole || ''
  ]);
  _downloadCSV('nutritrack_sessions_' + TODAY + '.csv', headers, rows);
  showToast('Sessions CSV exported ✓', 'success');
}

function exportFeedbackCSV() {
  const headers = ['Emoji','Message','Sender Name','User Role','User ID','Session ID','Device','Timestamp'];
  const rows = allFeedback.map(f => [
    f.emoji || '', (f.message || '').replace(/,/g,' '),
    f.userName || '—', f.userRole || '—', f.userId || '—',
    f.sessionId || '', _deviceLabel(f.deviceInfo), _fmtTs(f.sentAt)
  ]);
  _downloadCSV('nutritrack_feedback_' + TODAY + '.csv', headers, rows);
  showToast('Feedback CSV exported ✓', 'success');
}

function _downloadCSV(filename, headers, rows) {
  const csv  = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click(); URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════════
   TAB NAVIGATION
═══════════════════════════════════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.ttn-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.btn-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.getElementById('nav-' + tab)?.classList.add('active');

  // ── Top tab nav (Home + Settings) ─────────────────────────────
  const ttnMap = {
    home:      'ttn-home',
    settings:  'ttn-settings',
    developer: 'ttn-developer',
    library:   'ttn-library',
  };
  const ttnTarget = ttnMap[tab];
  if (ttnTarget) document.getElementById(ttnTarget)?.classList.add('active');

  // ── Bottom tab nav (Analytics, Online, Sessions, Feedback) ────
  const btnMap = {
    analytics: 'btn-analytics',
    online:    'btn-online',
    sessions:  'btn-sessions',
    feedback:  'btn-feedback',
  };
  const btnTarget = btnMap[tab];
  if (Array.isArray(btnTarget)) btnTarget.forEach(id => document.getElementById(id)?.classList.add('active'));
  else if (btnTarget) document.getElementById(btnTarget)?.classList.add('active');

  const labels = { home:'Home', overview:'Overview', analytics:'Analytics', online:'Online', sessions:'Sessions', feedback:'Feedback', settings:'Settings', users:'Users', errors:'Error Log', offline:'Offline Usage', developer:'Developer Profile', library:'Library' };
  document.getElementById('content-title').textContent = labels[tab] || tab;

  if (tab === 'overview')  { setTimeout(_renderOverviewCharts, 50); }
  if (tab === 'analytics') { setTimeout(_renderAnalyticsCharts, 50); setTimeout(_renderLiveUsersTable, 50); }
  if (tab === 'online')    { setTimeout(_renderOnlineTab, 50); }
  if (tab === 'settings')  { setTimeout(() => { _syncAppearanceUI(); _renderBgPreviews(); }, 30); }
  if (tab === 'users')     { setTimeout(renderUsersTable, 50); }
  if (tab === 'errors')    { setTimeout(renderErrorLog, 50); }
  if (tab === 'offline')   { setTimeout(renderOfflineTab, 50); }
  if (tab === 'developer') { setTimeout(devLoadProfile, 50); }
  if (tab === 'library')   { setTimeout(() => { if (window.LibAdmin) LibAdmin.init(); }, 50); }
}

/* ═══════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════ */
function _esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast-item toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

/* ═══════════════════════════════════════════════════════════
   APPEARANCE SETTINGS ENGINE
═══════════════════════════════════════════════════════════ */

const APPEARANCE_DEFAULTS = {
  theme: 'dark', accent: '#1de9d4', textIntensity: 'normal',
  textSize: 'm', typeface: 'Barlow', bg: 'none', compact: false,
};
let APPEARANCE = { ...APPEARANCE_DEFAULTS };

/* ── Theme variable maps ── */
const THEMES = {
  dark: {
    '--bg':'#020510','--surface':'#080f1e','--surface2':'#0d1729','--surface3':'#121f36',
    '--border':'rgba(255,255,255,0.07)','--border2':'rgba(255,255,255,0.12)',
    '--text':'#c8d8f0','--text-dim':'#6b82a0','--text-muted':'#3d5070',
  },
  light: {
    '--bg':'#edf2f9','--surface':'#ffffff','--surface2':'#f4f7fb','--surface3':'#e8eef6',
    '--border':'rgba(0,0,0,0.08)','--border2':'rgba(0,0,0,0.15)',
    '--text':'#1a2a44','--text-dim':'#4a6080','--text-muted':'#8090a8',
  },
  amoled: {
    '--bg':'#000000','--surface':'#080808','--surface2':'#101010','--surface3':'#181818',
    '--border':'rgba(255,255,255,0.06)','--border2':'rgba(255,255,255,0.10)',
    '--text':'#e0eeff','--text-dim':'#6080a0','--text-muted':'#304050',
  },
  hc: {
    '--bg':'#000000','--surface':'#0c0c0c','--surface2':'#161616','--surface3':'#202020',
    '--border':'rgba(255,255,255,0.35)','--border2':'rgba(255,255,255,0.65)',
    '--text':'#ffffff','--text-dim':'#dddddd','--text-muted':'#aaaaaa',
  },
};
const TEXT_INTENSITY_VARS = {
  soft:   { '--text':'#8098b8','--text-dim':'#4a6070','--text-muted':'#283840' },
  normal: null,
  strong: { '--text':'#e8f4ff','--text-dim':'#b0cce8','--text-muted':'#6088a8' },
};
const TEXT_SCALE = { s:'0.875', m:'1', l:'1.125', xl:'1.25' };

/* ── SVG pattern strings ── */
const SVG = {
  circuit: `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><path d='M20 60 H50 M70 60 H100 M60 20 V50 M60 70 V100 M20 20 H40 V40 M80 20 H100 V40 M20 80 H40 V100 M80 80 H100 V100' stroke='rgba(29,233,212,0.12)' stroke-width='1' fill='none'/><circle cx='60' cy='60' r='5' fill='none' stroke='rgba(29,233,212,0.18)' stroke-width='1'/><circle cx='50' cy='60' r='2.5' fill='rgba(29,233,212,0.22)'/><circle cx='70' cy='60' r='2.5' fill='rgba(29,233,212,0.22)'/><circle cx='60' cy='50' r='2.5' fill='rgba(29,233,212,0.22)'/><circle cx='60' cy='70' r='2.5' fill='rgba(29,233,212,0.22)'/><circle cx='40' cy='40' r='2' fill='rgba(29,233,212,0.15)'/><circle cx='80' cy='40' r='2' fill='rgba(29,233,212,0.15)'/><circle cx='40' cy='80' r='2' fill='rgba(29,233,212,0.15)'/><circle cx='80' cy='80' r='2' fill='rgba(29,233,212,0.15)'/></svg>`,
  topo:    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><ellipse cx='100' cy='100' rx='90' ry='70' fill='none' stroke='rgba(29,233,212,0.07)' stroke-width='1'/><ellipse cx='100' cy='100' rx='70' ry='52' fill='none' stroke='rgba(29,233,212,0.09)' stroke-width='1'/><ellipse cx='100' cy='100' rx='50' ry='36' fill='none' stroke='rgba(29,233,212,0.11)' stroke-width='1'/><ellipse cx='100' cy='100' rx='30' ry='20' fill='none' stroke='rgba(29,233,212,0.14)' stroke-width='1'/><ellipse cx='100' cy='100' rx='12' ry='7' fill='none' stroke='rgba(29,233,212,0.18)' stroke-width='1'/><ellipse cx='40' cy='150' rx='35' ry='25' fill='none' stroke='rgba(29,233,212,0.06)' stroke-width='1'/><ellipse cx='40' cy='150' rx='20' ry='14' fill='none' stroke='rgba(29,233,212,0.09)' stroke-width='1'/><ellipse cx='160' cy='50' rx='30' ry='20' fill='none' stroke='rgba(29,233,212,0.06)' stroke-width='1'/><ellipse cx='160' cy='50' rx='16' ry='10' fill='none' stroke='rgba(29,233,212,0.09)' stroke-width='1'/></svg>`,
  forest:  `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><path d='M40 72 L40 50 M40 50 C40 38 20 32 22 18 C24 8 36 4 40 10 C44 4 56 8 58 18 C60 32 40 38 40 50Z' fill='none' stroke='rgba(52,211,153,0.14)' stroke-width='1' stroke-linejoin='round'/><path d='M15 72 L15 58 M15 58 C15 50 4 46 5 37 C6 30 12 28 15 32 C18 28 24 30 25 37 C26 46 15 50 15 58Z' fill='none' stroke='rgba(52,211,153,0.09)' stroke-width='1' stroke-linejoin='round'/><path d='M65 72 L65 60 M65 60 C65 53 56 50 57 43 C58 37 63 35 65 39 C67 35 72 37 73 43 C74 50 65 53 65 60Z' fill='none' stroke='rgba(52,211,153,0.09)' stroke-width='1' stroke-linejoin='round'/></svg>`,
  linen:   `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><line x1='0' y1='24' x2='24' y2='0' stroke='rgba(200,216,240,0.05)' stroke-width='0.6'/><line x1='-6' y1='6' x2='6' y2='-6' stroke='rgba(200,216,240,0.04)' stroke-width='0.6'/><line x1='18' y1='30' x2='30' y2='18' stroke='rgba(200,216,240,0.04)' stroke-width='0.6'/><line x1='0' y1='0' x2='24' y2='24' stroke='rgba(200,216,240,0.03)' stroke-width='0.5'/></svg>`,
};
function _svgUrl(key) { return `url("data:image/svg+xml,${encodeURIComponent(SVG[key])}")`; }

/* ── Background pattern definitions ── */
const BG_PATTERNS = {
  none:      { image:'none' },
  grid:      { image:`linear-gradient(rgba(29,233,212,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(29,233,212,0.05) 1px,transparent 1px)`, size:'32px 32px' },
  dots:      { image:`radial-gradient(circle, rgba(29,233,212,0.22) 1px, transparent 1px)`, size:'20px 20px' },
  lines:     { image:`repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(29,233,212,0.05) 32px)` },
  circuit:   { image:_svgUrl('circuit'), size:'120px 120px' },
  blueprint: { image:`linear-gradient(rgba(96,165,250,0.10) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,0.10) 1px,transparent 1px),linear-gradient(rgba(96,165,250,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,0.04) 1px,transparent 1px)`, size:'80px 80px, 80px 80px, 20px 20px, 20px 20px' },
  aurora:    { aurora: true },
  midnight:  { image:`radial-gradient(circle, rgba(255,255,255,0.28) 1px, transparent 1px), radial-gradient(circle, rgba(255,255,255,0.14) 1px, transparent 1px)`, size:'90px 90px, 50px 50px', pos:'0 0, 45px 25px' },
  forest:    { image:_svgUrl('forest'), size:'80px 80px' },
  ember:     { image:`radial-gradient(ellipse 60% 55% at 30% 60%, rgba(249,115,22,0.09), transparent 65%), radial-gradient(ellipse 50% 60% at 75% 35%, rgba(251,113,133,0.07), transparent 60%), radial-gradient(ellipse 40% 40% at 55% 80%, rgba(240,180,41,0.05), transparent 55%)` },
  topo:      { image:_svgUrl('topo'), size:'200px 200px' },
  linen:     { image:_svgUrl('linen'), size:'24px 24px' },
};

/* ── Preview thumbnails ── */
function _renderBgPreviews() {
  const previews = {
    grid:      { bg:'#020510', overlay:`linear-gradient(rgba(29,233,212,0.12) 1px,transparent 1px),linear-gradient(90deg,rgba(29,233,212,0.12) 1px,transparent 1px)`, size:'10px 10px' },
    dots:      { bg:'#020510', overlay:`radial-gradient(circle, rgba(29,233,212,0.5) 1px, transparent 1px)`, size:'7px 7px' },
    lines:     { bg:'#020510', overlay:`repeating-linear-gradient(0deg,transparent,transparent 9px,rgba(29,233,212,0.14) 10px)` },
    circuit:   { bg:'#020510', overlay:_svgUrl('circuit'), size:'60px 60px' },
    blueprint: { bg:'#030a18', overlay:`linear-gradient(rgba(96,165,250,0.22) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,0.22) 1px,transparent 1px),linear-gradient(rgba(96,165,250,0.08) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,0.08) 1px,transparent 1px)`, size:'20px 20px,20px 20px,5px 5px,5px 5px' },
    midnight:  { bg:'#000510', overlay:`radial-gradient(circle, rgba(255,255,255,0.55) 1px, transparent 1px), radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)`, size:'22px 22px, 13px 13px', pos:'0 0, 11px 7px' },
    forest:    { bg:'#030d08', overlay:_svgUrl('forest'), size:'40px 40px' },
    topo:      { bg:'#020510', overlay:_svgUrl('topo'), size:'100px 100px' },
    linen:     { bg:'#050a14', overlay:_svgUrl('linen'), size:'12px 12px' },
  };
  Object.entries(previews).forEach(([key, p]) => {
    const el = document.getElementById('bgprev-' + key);
    if (!el) return;
    el.style.background = p.bg;
    el.style.backgroundImage = p.overlay;
    if (p.size) el.style.backgroundSize = p.size;
    if (p.pos)  el.style.backgroundPosition = p.pos;
  });
}

/* ── Hex → RGB components ── */
function _hexToRgb(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

/* ── Core apply function ── */
function applyAppearance() {
  const root = document.documentElement;
  const { theme, accent, textIntensity, textSize, typeface, bg, compact } = APPEARANCE;

  // Theme
  const resolvedTheme = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  const vars = THEMES[resolvedTheme] || THEMES.dark;
  Object.entries(vars).forEach(([k,v]) => root.style.setProperty(k, v));

  // Accent
  root.style.setProperty('--teal', accent);
  const [r,g,b] = _hexToRgb(accent);
  root.style.setProperty('--accent-rgb', `${r},${g},${b}`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', accent);

  // Text intensity overlay
  const ti = TEXT_INTENSITY_VARS[textIntensity];
  if (ti) Object.entries(ti).forEach(([k,v]) => root.style.setProperty(k, v));

  // Text size
  const scale = TEXT_SCALE[textSize] || '1';
  document.body.style.fontSize = (parseFloat(scale) * 14) + 'px';

  // Typeface
  root.style.setProperty('--sans', `'${typeface}', sans-serif`);
  document.body.style.fontFamily = `'${typeface}', sans-serif`;

  // Background pattern
  const bgClass = 'bg-' + bg;
  document.body.className = document.body.className
    .replace(/\bbg-\S+/g, '').trim();
  if (bg === 'aurora') {
    document.body.classList.add('bg-aurora');
    root.style.setProperty('--bg-pattern', 'none');
  } else {
    const pat = BG_PATTERNS[bg] || BG_PATTERNS.none;
    root.style.setProperty('--bg-pattern', pat.image || 'none');
    root.style.setProperty('--bg-pattern-size', pat.size || 'auto');
    root.style.setProperty('--bg-pattern-pos', pat.pos || '0 0');
  }

  // Compact
  document.body.classList.toggle('compact', !!compact);
  const compToggle = document.getElementById('toggle-compact');
  if (compToggle) compToggle.checked = !!compact;
}

/* ── setSetting — called by all controls ── */
function setSetting(key, val, el) {
  APPEARANCE[key] = val;

  // Update active state in the relevant group
  if (el) {
    const groupId = { theme:'sg-theme', textIntensity:'sg-intensity', textSize:'sg-size', typeface:'sg-typeface', bg:'sg-bg' }[key];
    if (groupId) {
      document.getElementById(groupId)?.querySelectorAll('.chip,.typeface-card,.bg-option')
        .forEach(c => c.classList.remove('active'));
      el.classList.add('active');
    }
  }

  applyAppearance();
  _saveAppearance();
}

/* ── Accent helpers ── */
function setAccent(hex, el) {
  APPEARANCE.accent = hex;
  document.querySelectorAll('#sg-accent .accent-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  applyAppearance();
  _saveAppearance();
}
function setAccentCustom(hex) {
  APPEARANCE.accent = hex;
  document.querySelectorAll('#sg-accent .accent-swatch').forEach(s => s.classList.remove('active'));
  document.getElementById('accent-custom-swatch').classList.add('active');
  document.getElementById('accent-custom-swatch').style.background = hex;
  applyAppearance();
  _saveAppearance();
}

/* ── Persist appearance preferences to localStorage (UI settings only — not clinical data) ── */
function _saveAppearance() {
  try { localStorage.setItem('nt_admin_appearance', JSON.stringify(APPEARANCE)); } catch(e) {}
}
function _loadAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem('nt_admin_appearance') || 'null');
    if (saved) APPEARANCE = { ...APPEARANCE_DEFAULTS, ...saved };
  } catch(e) {}
}

/* ── Sync UI controls to current state ── */
function _syncAppearanceUI() {
  const { theme, textIntensity, textSize, typeface, bg, accent } = APPEARANCE;

  const syncGroup = (groupId, val, selector) => {
    const g = document.getElementById(groupId);
    if (!g) return;
    g.querySelectorAll(selector).forEach(el => {
      el.classList.toggle('active', el.dataset.val === val);
    });
  };

  syncGroup('sg-theme',     theme,         '.chip');
  syncGroup('sg-intensity', textIntensity, '.chip');
  syncGroup('sg-size',      textSize,      '.chip');
  syncGroup('sg-typeface',  typeface,      '.typeface-card');
  syncGroup('sg-bg',        bg,            '.bg-option');

  // Accent
  const accentPresets = ['#1de9d4','#f0b429','#60a5fa','#a78bfa','#34d399','#fb7185','#f97316','#e879f9'];
  document.querySelectorAll('#sg-accent .accent-swatch').forEach(s => s.classList.remove('active'));
  if (accentPresets.includes(accent)) {
    document.querySelector(`#sg-accent .accent-swatch[data-val="${accent}"]`)?.classList.add('active');
  } else {
    const cs = document.getElementById('accent-custom-swatch');
    if (cs) { cs.classList.add('active'); cs.style.background = accent; }
  }
}

/* ── Boot ── */
_loadAppearance();
_renderBgPreviews();
applyAppearance();

// Sync UI once DOM is ready (settings tab may not be rendered yet)
document.addEventListener('DOMContentLoaded', () => { _syncAppearanceUI(); });
// Also sync when settings tab is opened
const _origSwitchTab = switchTab;
// Patch switchTab to sync UI when settings tab opens
const _stgSwitchPatch = () => {
  if (document.getElementById('tab-settings')?.classList.contains('active')) {
    _syncAppearanceUI();
    _renderBgPreviews();
  }
};
window.__stgPatch = _stgSwitchPatch;

// Auto theme: respond to OS preference changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (APPEARANCE.theme === 'auto') applyAppearance();
});

/* ── Clock ── */
function _updateClock() {
  const now = new Date();
  let h = now.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mm = String(now.getMinutes()).padStart(2,'0');
  const ss = String(now.getSeconds()).padStart(2,'0');
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const day = days[now.getDay()];
  const date = String(now.getDate()).padStart(2,'0');
  const tEl = document.getElementById('sb-clock-time');
  if (tEl) tEl.innerHTML = `${String(h).padStart(2,'0')}<span class="sb-colon">:</span>${mm}<span class="sb-colon">:</span>${ss}`;
  const aEl = document.getElementById('sb-clock-ampm');
  if (aEl) aEl.textContent = ampm;
  const dEl = document.getElementById('sb-clock-date');
  if (dEl) dEl.textContent = `${day} ${date}`;
}
_updateClock(); setInterval(_updateClock, 1000);

/* ── Refresh presence display every 30s for accurate "ago" times ── */
setInterval(() => { _updatePresenceKPIs(); _renderLiveUsersTable(); }, 30_000);

/* ── Enter key on login handled via onkeydown on input fields ── */

/* ═══════════════════════════════════════════════════════════
   PWA — ICON GENERATOR (runtime canvas-based)
═══════════════════════════════════════════════════════════ */
// Preload the Oasis logo for use in icon generation
const _NTP_LOGO_B64 = "data:image/png;base64,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";
const _ntpLogoImg = new Image();
_ntpLogoImg.src = _NTP_LOGO_B64;

function _generateIcon(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const s = size, cx = s / 2, cy = s / 2;

  // Background — dark navy with radial gradient (matches splash #030b18)
  const bg = ctx.createRadialGradient(cx, cy * 0.75, 0, cx, cy, s * 0.75);
  bg.addColorStop(0, '#0b1f3a'); bg.addColorStop(1, '#030b18');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0, 0, s, s, s * 0.22); ctx.fill();

  // Outer teal ring
  ctx.strokeStyle = 'rgba(0,245,228,0.80)'; ctx.lineWidth = Math.max(1, s * 0.030);
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.44, 0, Math.PI * 2); ctx.stroke();

  // Partial teal arc (top-left highlight)
  ctx.strokeStyle = '#00f5e4'; ctx.lineWidth = Math.max(1.5, s * 0.038);
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.44, -Math.PI * 0.55, Math.PI * 0.05); ctx.stroke();

  // Middle blue ring
  ctx.strokeStyle = 'rgba(59,130,246,0.65)'; ctx.lineWidth = Math.max(1, s * 0.022);
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.33, 0, Math.PI * 2); ctx.stroke();

  // Partial blue arc (bottom-right highlight)
  ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = Math.max(1, s * 0.030);
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.33, Math.PI * 0.45, Math.PI * 1.05); ctx.stroke();

  // Inner circle background
  const innerR = s * 0.22;
  const innerBg = ctx.createRadialGradient(cx - innerR*0.2, cy - innerR*0.2, 0, cx, cy, innerR);
  innerBg.addColorStop(0, '#0d2040'); innerBg.addColorStop(1, '#040e1e');
  ctx.fillStyle = innerBg;
  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,245,228,0.25)'; ctx.lineWidth = Math.max(0.5, s * 0.012);
  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2); ctx.stroke();

  // Draw logo image if loaded
  if (_ntpLogoImg.complete && _ntpLogoImg.naturalWidth > 0) {
    const imgSize = innerR * 1.45;
    ctx.drawImage(_ntpLogoImg, cx - imgSize / 2, cy - imgSize / 2, imgSize, imgSize);
  } else {
    // Fallback text
    const fs = Math.round(s * 0.13);
    ctx.font = `700 ${fs}px 'Space Grotesk',sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00f5e4'; ctx.fillText('N', cx - fs * 0.38, cy);
    ctx.fillStyle = '#e8f4ff'; ctx.fillText('T', cx + fs * 0.38, cy);
  }

  return canvas.toDataURL('image/png');
}

function _generateScreenshot(w, h, formFactor) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#020510'; ctx.fillRect(0, 0, w, h);

  // Subtle radial glows
  const g1 = ctx.createRadialGradient(w*0.15, h*0.2, 0, w*0.15, h*0.2, w*0.4);
  g1.addColorStop(0, 'rgba(29,233,212,0.06)'); g1.addColorStop(1, 'transparent');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h);
  const g2 = ctx.createRadialGradient(w*0.85, h*0.8, 0, w*0.85, h*0.8, w*0.35);
  g2.addColorStop(0, 'rgba(240,180,41,0.05)'); g2.addColorStop(1, 'transparent');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);

  const u = w / 360; // scale unit

  if (formFactor === 'wide') {
    // ── Header bar ──
    ctx.fillStyle = '#080f1e';
    ctx.fillRect(0, 0, w, h * 0.07);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(0, h * 0.07 - 1, w, 1);

    // Brand ring
    ctx.strokeStyle = 'rgba(29,233,212,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(u * 20, h * 0.035, u * 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#c8d8f0'; ctx.font = `bold ${u * 8}px 'JetBrains Mono',monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Oasis', u * 34, h * 0.035);
    ctx.fillStyle = '#f0b429'; ctx.fillText(' Pro', u * 34 + u * 44, h * 0.035);

    // Status pill
    ctx.fillStyle = 'rgba(52,211,153,0.12)';
    const ph = h * 0.03, py = h * 0.035 - ph / 2, px = w - u * 60;
    roundRect(ctx, px, py, u * 40, ph, ph / 2); ctx.fill();
    ctx.fillStyle = '#34d399'; ctx.beginPath();
    ctx.arc(px + u * 8, h * 0.035, u * 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#34d399'; ctx.font = `${u * 5}px 'JetBrains Mono',monospace`;
    ctx.textAlign = 'left'; ctx.fillText('LIVE', px + u * 14, h * 0.035 + u * 2);

    // ── Sidebar ──
    const sbW = u * 55;
    ctx.fillStyle = '#080f1e';
    ctx.fillRect(0, h * 0.07, sbW, h * 0.93);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(sbW - 1, h * 0.07, 1, h * 0.93);

    // Nav items
    const navItems = [
      { label: 'Home',      active: false, y: 0.13 },
      { label: 'Overview',  active: true,  y: 0.20 },
      { label: 'Analytics', active: false, y: 0.27 },
      { label: 'Sessions',  active: false, y: 0.34 },
      { label: 'Feedback',  active: false, y: 0.48 },
    ];
    navItems.forEach(({ label, active, y }) => {
      if (active) {
        ctx.fillStyle = 'rgba(29,233,212,0.1)';
        roundRect(ctx, u * 4, h * y - h * 0.025, sbW - u * 8, h * 0.05, u * 4);
        ctx.fill();
        ctx.fillStyle = '#1de9d4';
        ctx.strokeStyle = 'rgba(29,233,212,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, h * y - h * 0.025);
        ctx.lineTo(0, h * y + h * 0.025); ctx.stroke();
      } else {
        ctx.fillStyle = '#6b82a0';
      }
      ctx.font = `${u * 5.5}px 'Space Grotesk',sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, u * 14, h * y);
    });

    // ── Main content area ──
    const cx2 = sbW + u * 12;
    const cw = w - sbW - u * 24;

    // KPI cards row
    const kpis = [
      { label: 'ACTIVE SESSIONS', val: '24',  color: '#1de9d4' },
      { label: 'TOTAL USERS',     val: '318', color: '#f0b429' },
      { label: 'CALCULATIONS',    val: '1.2k',color: '#60a5fa' },
      { label: 'FEEDBACK',        val: '47',  color: '#a78bfa' },
    ];
    const cardW = (cw - u * 9) / 4;
    kpis.forEach(({ label, val, color }, i) => {
      const kx = cx2 + i * (cardW + u * 3);
      const ky = h * 0.10;
      ctx.fillStyle = '#080f1e';
      roundRect(ctx, kx, ky, cardW, h * 0.13, u * 4); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      roundRect(ctx, kx, ky, cardW, h * 0.13, u * 4); ctx.stroke();
      // accent line
      ctx.fillStyle = color; ctx.globalAlpha = 0.6;
      ctx.fillRect(kx + u * 4, ky + h * 0.002, cardW - u * 8, h * 0.004);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#3d5070'; ctx.font = `${u * 4}px 'JetBrains Mono',monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(label, kx + u * 8, ky + h * 0.02);
      ctx.fillStyle = color; ctx.font = `bold ${u * 14}px 'Space Grotesk',sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(val, kx + u * 8, ky + h * 0.085);
    });

    // Chart placeholder cards
    const chartY = h * 0.27;
    const chartH = h * 0.36;
    [[cx2, (cw - u * 6) * 0.62], [cx2 + (cw - u * 6) * 0.62 + u * 6, (cw - u * 6) * 0.38]].forEach(([x, cWidth]) => {
      ctx.fillStyle = '#080f1e';
      roundRect(ctx, x, chartY, cWidth, chartH, u * 4); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      roundRect(ctx, x, chartY, cWidth, chartH, u * 4); ctx.stroke();
      // Mini chart lines
      ctx.strokeStyle = 'rgba(29,233,212,0.25)'; ctx.lineWidth = 0.5;
      for (let row = 1; row < 5; row++) {
        const ly = chartY + chartH * (row / 5);
        ctx.beginPath(); ctx.moveTo(x + u * 8, ly); ctx.lineTo(x + cWidth - u * 8, ly); ctx.stroke();
      }
      // Simulated line chart
      ctx.strokeStyle = '#1de9d4'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      const pts = [0.6, 0.4, 0.7, 0.3, 0.55, 0.2, 0.45, 0.65, 0.3, 0.5];
      pts.forEach((p, idx) => {
        const px2 = x + u * 12 + idx * ((cWidth - u * 24) / (pts.length - 1));
        const py2 = chartY + chartH * 0.2 + p * chartH * 0.6;
        idx === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
      });
      ctx.stroke();
      // Fill under line
      ctx.fillStyle = 'rgba(29,233,212,0.05)';
      ctx.lineTo(x + cWidth - u * 12, chartY + chartH * 0.9);
      ctx.lineTo(x + u * 12, chartY + chartH * 0.9);
      ctx.closePath(); ctx.fill();
    });

    // Table rows
    const tableY = h * 0.68;
    ctx.fillStyle = '#080f1e';
    roundRect(ctx, cx2, tableY, cw, h * 0.28, u * 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    roundRect(ctx, cx2, tableY, cw, h * 0.28, u * 4); ctx.stroke();
    // Table header
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    roundRect(ctx, cx2, tableY, cw, h * 0.055, u * 4); ctx.fill();
    ['SESSION ID','INSTITUTION','MODULE','STATUS'].forEach((col, i) => {
      ctx.fillStyle = '#3d5070'; ctx.font = `${u * 4}px 'JetBrains Mono',monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(col, cx2 + u * 8 + i * (cw / 4), tableY + h * 0.027);
    });
    // Table rows
    const rowColors = ['#1de9d4','#f0b429','#34d399','#60a5fa'];
    for (let row = 0; row < 4; row++) {
      const ry = tableY + h * 0.055 + row * h * 0.055;
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(cx2 + u * 8, ry); ctx.lineTo(cx2 + cw - u * 8, ry); ctx.stroke();
      ctx.fillStyle = rowColors[row]; ctx.globalAlpha = 0.7;
      ctx.fillRect(cx2 + u * 8, ry + h * 0.015, u * 3, h * 0.02);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#6b82a0'; ctx.font = `${u * 4.5}px 'Space Grotesk',sans-serif`;
      ctx.fillText(`ses_${1000 + row * 37}`, cx2 + u * 15, ry + h * 0.025);
      ctx.fillText('QECH — Zomba', cx2 + u * 8 + cw / 4, ry + h * 0.025);
      ctx.fillText('ICU Feeding', cx2 + u * 8 + cw / 2, ry + h * 0.025);
      ctx.fillStyle = rowColors[row]; ctx.font = `${u * 3.5}px 'JetBrains Mono',monospace`;
      ctx.fillText('ACTIVE', cx2 + u * 8 + cw * 0.75, ry + h * 0.025);
    }

  } else {
    // ── NARROW (mobile) layout ──
    // Header
    ctx.fillStyle = '#080f1e'; ctx.fillRect(0, 0, w, h * 0.07);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(0, h * 0.07 - 1, w, 1);
    ctx.strokeStyle = 'rgba(29,233,212,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(u * 18, h * 0.035, u * 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#c8d8f0'; ctx.font = `bold ${u * 9}px 'Space Grotesk',sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Oasis', u * 32, h * 0.033);
    ctx.fillStyle = '#f0b429'; ctx.fillText('Admin', u * 32 + u * 49, h * 0.033);

    // KPI cards (2×2)
    const kpisMob = [
      { label: 'ACTIVE', val: '24',  color: '#1de9d4' },
      { label: 'USERS',  val: '318', color: '#f0b429' },
      { label: 'CALCS',  val: '1.2k',color: '#60a5fa' },
      { label: 'ALERTS', val: '3',   color: '#fb7185' },
    ];
    const mCardW = (w - u * 36) / 2;
    kpisMob.forEach(({ label, val, color }, i) => {
      const mx = u * 12 + (i % 2) * (mCardW + u * 12);
      const my = h * 0.09 + Math.floor(i / 2) * (h * 0.11 + u * 6);
      ctx.fillStyle = '#0d1729';
      roundRect(ctx, mx, my, mCardW, h * 0.11, u * 4); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
      roundRect(ctx, mx, my, mCardW, h * 0.11, u * 4); ctx.stroke();
      ctx.fillStyle = color; ctx.globalAlpha = 0.5;
      ctx.fillRect(mx + u * 3, my + h * 0.002, mCardW - u * 6, h * 0.003);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#3d5070'; ctx.font = `${u * 5}px 'JetBrains Mono',monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(label, mx + u * 7, my + h * 0.018);
      ctx.fillStyle = color; ctx.font = `bold ${u * 16}px 'Space Grotesk',sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(val, mx + u * 7, my + h * 0.072);
    });

    // Chart card
    const chartY2 = h * 0.36;
    ctx.fillStyle = '#080f1e';
    roundRect(ctx, u * 12, chartY2, w - u * 24, h * 0.22, u * 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    roundRect(ctx, u * 12, chartY2, w - u * 24, h * 0.22, u * 4); ctx.stroke();
    ctx.strokeStyle = 'rgba(29,233,212,0.2)'; ctx.lineWidth = 0.5;
    for (let row = 1; row < 4; row++) {
      const ly = chartY2 + h * 0.22 * (row / 4);
      ctx.beginPath(); ctx.moveTo(u * 18, ly); ctx.lineTo(w - u * 18, ly); ctx.stroke();
    }
    ctx.strokeStyle = '#1de9d4'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    const pts2 = [0.7, 0.45, 0.6, 0.25, 0.5, 0.35, 0.55, 0.2, 0.4];
    pts2.forEach((p, idx) => {
      const px3 = u * 20 + idx * ((w - u * 40) / (pts2.length - 1));
      const py3 = chartY2 + h * 0.04 + p * h * 0.14;
      idx === 0 ? ctx.moveTo(px3, py3) : ctx.lineTo(px3, py3);
    });
    ctx.stroke();
    ctx.fillStyle = 'rgba(29,233,212,0.06)';
    ctx.lineTo(w - u * 20, chartY2 + h * 0.2); ctx.lineTo(u * 20, chartY2 + h * 0.2);
    ctx.closePath(); ctx.fill();

    // Sessions list
    const listY = h * 0.61;
    ctx.fillStyle = '#080f1e';
    roundRect(ctx, u * 12, listY, w - u * 24, h * 0.34, u * 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    roundRect(ctx, u * 12, listY, w - u * 24, h * 0.34, u * 4); ctx.stroke();
    ctx.fillStyle = '#3d5070'; ctx.font = `${u * 5}px 'JetBrains Mono',monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('RECENT SESSIONS', u * 20, listY + u * 7);
    const rColors = ['#1de9d4','#f0b429','#34d399','#a78bfa'];
    for (let row = 0; row < 4; row++) {
      const ry = listY + h * 0.06 + row * h * 0.068;
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5;
      if (row > 0) { ctx.beginPath(); ctx.moveTo(u * 20, ry); ctx.lineTo(w - u * 20, ry); ctx.stroke(); }
      ctx.fillStyle = rColors[row];
      ctx.beginPath(); ctx.arc(u * 24, ry + h * 0.03, u * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8d8f0'; ctx.font = `${u * 6}px 'Space Grotesk',sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`Session ${1000 + row * 37}`, u * 32, ry + h * 0.02);
      ctx.fillStyle = '#3d5070'; ctx.font = `${u * 5}px 'JetBrains Mono',monospace`;
      ctx.fillText('QECH · ICU Feeding', u * 32, ry + h * 0.044);
    }

    // Bottom nav bar
    ctx.fillStyle = '#080f1e'; ctx.fillRect(0, h * 0.95, w, h * 0.05);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(0, h * 0.95, w, 1);
    const navLabels = ['Home','Stats','Sessions','Settings'];
    navLabels.forEach((label, i) => {
      const nx = (w / 4) * i + w / 8;
      ctx.fillStyle = i === 1 ? '#1de9d4' : '#3d5070';
      ctx.font = `${u * 5}px 'Space Grotesk',sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, nx, h * 0.972);
    });
  }

  return canvas.toDataURL('image/png');
}

// Helper: roundRect path (polyfill for older canvas)
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Convert a canvas data URL → a proper blob: URL so manifest src values
// are resolvable URLs with a verifiable MIME type (not embedded base64 strings).
function _toBlobURL(dataURL) {
  const [header, b64] = dataURL.split(',');
  const mime = header.match(/:(.*?);/)[1]; // e.g. 'image/png'
  const bytes = atob(b64);
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return URL.createObjectURL(new Blob([buf], { type: mime }));
}

function _injectManifest() {
  // Icon sizes required by PWA spec — any and maskable as separate entries
  const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];
  const iconsAny      = iconSizes.map(sz => ({ src: _toBlobURL(_generateIcon(sz)), sizes: `${sz}x${sz}`, type: 'image/png', purpose: 'any' }));
  const iconsMaskable = iconSizes.map(sz => ({ src: _toBlobURL(_generateIcon(sz)), sizes: `${sz}x${sz}`, type: 'image/png', purpose: 'maskable' }));

  document.getElementById('apple-touch-icon-180').href = _toBlobURL(_generateIcon(180));
  document.getElementById('favicon-32').href           = _toBlobURL(_generateIcon(32));

  // Screenshots (wide = desktop, narrow = mobile)
  const screenshots = [
    { src: _toBlobURL(_generateScreenshot(1280, 720, 'wide')),   sizes: '1280x720', type: 'image/png', form_factor: 'wide',   label: 'Oasis Admin — Overview Dashboard' },
    { src: _toBlobURL(_generateScreenshot(390,  844, 'narrow')), sizes: '390x844',  type: 'image/png', form_factor: 'narrow', label: 'Oasis Admin — Mobile View' },
  ];

  const manifest = {
    id: '/oasis-admin/',
    name: `Oasis — Admin Dashboard ${ADMIN_VERSION}`, short_name: 'Oasis Admin',
    description: 'Clinical nutrition admin dashboard',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#020510',
    theme_color: '#1de9d4',
    orientation: 'portrait',  // JS probe in orientation_manager unlocks if auto-rotate is ON
    lang: 'en',
    categories: ['medical', 'health', 'productivity'],
    icons: [...iconsAny, ...iconsMaskable],
    screenshots,
  };
  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
  document.getElementById('pwa-manifest').href = URL.createObjectURL(blob);
}

function _registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then(r => console.log('[SW] Registered ✓', r.scope))
    .catch(e => console.warn('[SW] Failed:', e));
}

/* ── Orientation + keyboard glue ───────────────────────────
   orientation_manager.js fires 'oasis:orientation' and tracks
   keyboard state; here we wire up any app-level reactions.
   ──────────────────────────────────────────────────────── */
(function _bindOrientationHooks() {
  /* Re-render charts and tabs on rotation */
  document.addEventListener('oasis:orientation', function (e) {
    const tab = document.querySelector('.tab-pane.active');
    if (!tab) return;
    const tabId = tab.id.replace(/^tab-/, '');
    // Chart re-render already fired by orientation_manager;
    // switchTab gives a full data+chart refresh on complex tabs.
    setTimeout(() => switchTab(tabId), 200);
  });

  /* Toggle .keyboard-open on body for CSS keyboard-aware rules */
  if (window.visualViewport) {
    const THRESH = 140;
    let baseH    = window.visualViewport.height;

    window.visualViewport.addEventListener('resize', function () {
      const h    = window.visualViewport.height;
      const diff = baseH - h;
      if (diff > THRESH) {
        document.body.classList.add('keyboard-open');
      } else {
        document.body.classList.remove('keyboard-open');
        baseH = h;
      }
    });
  }
})();


/* ── SPLASH SCREEN DISMISS ── */
function _dismissSplash() {
  const el = document.getElementById('admin-splash');
  if (el) {
    el.classList.add('hidden');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 600);
  }
}
// Dismiss after 2.6 s (gives animations time to play)
setTimeout(_dismissSplash, 2600);


/* ═══════════════════════════════════════════════════════════
   VERSION CONSTANTS
═══════════════════════════════════════════════════════════ */
const ADMIN_VERSION      = '1.0.0';
const ADMIN_VERSION_DATE = 'April 2026';

// Sync splash version text with the constant — update only ADMIN_VERSION above on each deploy
(function() {
  const el = document.getElementById('sp-version-text');
  if (el) el.textContent = 'Admin ' + ADMIN_VERSION;
})();

/* ═══════════════════════════════════════════════════════════
   ADMIN SELF-UPDATE  — Service Worker update detection
   Flow:
     1. On load, SW checks the deployed file hash.
     2. If a new SW is found ("waiting"), we surface the
        update banner + enable the Apply button in Settings.
     3. Admin clicks "Apply" → postMessage skipWaiting →
        SW activates → controllerchange fires → reload.
═══════════════════════════════════════════════════════════ */
let _waitingSW = null;

function _initSWUpdateDetection() {
  if (!('serviceWorker' in navigator)) {
    _setUpdStatus('error', 'Service worker not supported in this browser.');
    return;
  }

  navigator.serviceWorker.ready.then(reg => {
    // Already a waiting SW on arrival (e.g. user revisited after deploy)
    if (reg.waiting) {
      _onWaitingSW(reg.waiting);
    }

    // New SW found while page is open
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // There was already an active SW — this is a real update
            _onWaitingSW(newSW);
          } else {
            // First install
            _setUpdStatus('up-to-date', 'Admin console is up to date.');
          }
        }
      });
    });

    // Poll for updates every 90 s while the admin tab is open
    setInterval(() => { try { reg.update(); } catch(e) {} }, 90_000);
  }).catch(() => {
    _setUpdStatus('up-to-date', 'Admin console is up to date.');
  });

  // When the SW activates (after skipWaiting), reload
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

function _onWaitingSW(sw) {
  _waitingSW = sw;
  _setUpdStatus('available', 'New version deployed — ready to apply.');
  document.getElementById('upd-apply-btn').disabled = false;
  // Show the floating banner
  const banner = document.getElementById('update-banner');
  if (banner) banner.classList.add('visible');
}

function _setUpdStatus(type, text) {
  const dot  = document.getElementById('upd-status-dot');
  const txt  = document.getElementById('upd-status-text');
  if (!dot || !txt) return;
  dot.className = 'upd-status-dot ' + type;
  txt.textContent = text;
}

function checkAdminUpdate() {
  _setUpdStatus('checking', 'Checking for updates…');
  if (!('serviceWorker' in navigator)) {
    _setUpdStatus('error', 'Service worker not available.'); return;
  }
  navigator.serviceWorker.ready.then(reg => {
    reg.update().then(() => {
      if (!_waitingSW) {
        setTimeout(() => _setUpdStatus('up-to-date', 'Admin console is up to date ✓'), 1200);
      }
    }).catch(() => {
      _setUpdStatus('error', 'Update check failed — check your connection.');
    });
  });
}

function applyAdminUpdate() {
  if (_waitingSW) {
    _waitingSW.postMessage({ type: 'SKIP_WAITING' });
  } else {
    window.location.reload(true);
  }
}

function dismissUpdateBanner() {
  const b = document.getElementById('update-banner');
  if (b) b.classList.remove('visible');
}

/* ═══════════════════════════════════════════════════════════
   PUSH UPDATE TO Oasis PWA
   Two-channel approach:
     A) Firestore  system/app_version  — persists for all clients
        (including ones that open the app later after deploy)
     B) BroadcastChannel 'ntp-pwa-update' — instant signal to
        any NTP tab currently open in the same browser session.
   The Oasis main app must listen to both channels
   (see integration note written to the push-upd-log).
═══════════════════════════════════════════════════════════ */
async function pushUpdateToNTP() {
  const versionInput = document.getElementById('push-ver-input');
  const notesInput   = document.getElementById('push-notes-input');
  const btn          = document.getElementById('push-upd-btn');
  const log          = document.getElementById('push-upd-log');

  const version = (versionInput.value || '').trim();
  const notes   = (notesInput.value   || '').trim();

  if (!version) {
    _pushLog(log, 'error', '✕ Version number is required (e.g. 1.2.2).');
    return;
  }

  btn.disabled = true;
  _pushLog(log, 'info', '⏳ Pushing update signal…');

  const payload = {
    version,
    notes     : notes || '—',
    releasedAt: new Date().toISOString(),
    pushedBy  : 'Oasis Admin Dashboard',
    adminVersion: ADMIN_VERSION,
  };

  let firestoreOk = false;
  let broadcastOk = false;
  let rtdbOk      = false;

  // ── A: Firestore ────────────────────────────────────────────────────
  if (db) {
    try {
      await db.collection('system').doc('app_version').set(payload);
      firestoreOk = true;
      _pushLog(log, 'ok', '✓ Firestore · system/app_version updated.');
    } catch (err) {
      _pushLog(log, 'err', '✕ Firestore write failed: ' + err.message);
    }
  } else {
    _pushLog(log, 'warn', '⚠ Firestore offline — skipped (will retry on reconnect).');
  }

  // ── B: BroadcastChannel ─────────────────────────────────────────────
  try {
    const bc = new BroadcastChannel('ntp-pwa-update');
    bc.postMessage({ type: 'UPDATE_AVAILABLE', ...payload });
    bc.close();
    broadcastOk = true;
    _pushLog(log, 'ok', '✓ BroadcastChannel · signal sent to open Oasis tabs.');
  } catch (err) {
    _pushLog(log, 'warn', '⚠ BroadcastChannel not supported: ' + err.message);
  }

  // ── C: RTDB — instant signal via onValue listener in main app ───────
  if (rtdb) {
    try {
      await rtdb.ref('/system/app_version').set({
        ...payload,
        pushedAt: firebase.database.ServerValue.TIMESTAMP,
      });
      rtdbOk = true;
      _pushLog(log, 'ok', '✓ RTDB · /system/app_version updated — main app listeners will fire instantly.');
    } catch (err) {
      _pushLog(log, 'warn', '⚠ RTDB write failed: ' + err.message);
    }
  } else {
    _pushLog(log, 'warn', '⚠ RTDB offline — channel C skipped.');
  }

  // ── Summary ─────────────────────────────────────────────────────────
  if (firestoreOk || broadcastOk || rtdbOk) {
    const channels = [
      firestoreOk  ? 'Firestore'       : null,
      broadcastOk  ? 'BroadcastChannel': null,
      rtdbOk       ? 'RTDB'            : null,
    ].filter(Boolean).join(' + ');
    _pushLog(log, 'ok',
      `✓ Update v${version} pushed via ${channels}. Oasis clients will prompt users on next load or tab focus.`);
    showToast(`Update v${version} pushed to Oasis ✓`);
    // Clear inputs after success
    versionInput.value = '';
    notesInput.value   = '';
  } else {
    _pushLog(log, 'err', '✕ Push failed — no channels available. Check Firebase config and network.');
  }

  btn.disabled = false;
}

function _pushLog(el, type, msg) {
  if (!el) return;
  const now = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const cls = type === 'ok' ? 'log-ok' : type === 'err' ? 'log-err' : type === 'warn' ? 'log-warn' : 'log-info';
  el.innerHTML += (el.innerHTML ? '<br>' : '') + `<span class="${cls}">[${now}] ${msg}</span>`;
  el.scrollTop = el.scrollHeight;
}

/* ── PWA INSTALL PROMPT ── */
let _deferredInstallPrompt = null;
const _POPUP_DISMISSED_KEY = 'oasis_install_popup_dismissed';

// Show the popup (called on beforeinstallprompt, or manually via header button)
function showPWAInstallPopup() {
  const popup = document.getElementById('pwa-install-popup');
  if (!popup) return;
  // Draw the app icon into the popup canvas using the same generator
  try {
    const iconCanvas = document.getElementById('pwa-install-icon');
    if (iconCanvas && typeof _generateIcon === 'function') {
      const src = _generateIcon(52);
      const img = new Image();
      img.onload = () => iconCanvas.getContext('2d').drawImage(img, 0, 0, 52, 52);
      img.src = src;
    }
  } catch(e) { /* non-critical */ }
  popup.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePWAInstallPopup() {
  const popup = document.getElementById('pwa-install-popup');
  if (popup) popup.style.display = 'none';
  document.body.style.overflow = '';
  sessionStorage.setItem(_POPUP_DISMISSED_KEY, '1');
}

function confirmPWAInstall() {
  closePWAInstallPopup();
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then((choice) => {
    if (choice.outcome === 'accepted') {
      _deferredInstallPrompt = null;
      const btn = document.getElementById('btn-pwa-install');
      const sep = document.getElementById('sep-install');
      if (btn) btn.style.display = 'none';
      if (sep) sep.style.display = 'none';
    }
  });
}

// Legacy header button still works
function triggerPWAInstall() {
  if (_deferredInstallPrompt) {
    showPWAInstallPopup();
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  // Show header button
  const btn = document.getElementById('btn-pwa-install');
  const sep = document.getElementById('sep-install');
  if (btn) btn.style.display = '';
  if (sep) sep.style.display = '';
  // Show popup automatically unless dismissed this session
  if (!sessionStorage.getItem(_POPUP_DISMISSED_KEY)) {
    // Small delay so the app finishes rendering first
    setTimeout(showPWAInstallPopup, 1200);
  }
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  closePWAInstallPopup();
  const btn = document.getElementById('btn-pwa-install');
  const sep = document.getElementById('sep-install');
  if (btn) btn.style.display = 'none';
  if (sep) sep.style.display = 'none';
});

// Close popup on overlay click (outside modal)
window.addEventListener('click', (e) => {
  const popup = document.getElementById('pwa-install-popup');
  if (e.target === popup) closePWAInstallPopup();
});

/* ── BOOT ── */
(function boot() {
  _injectManifest();
  _registerSW();
  // SW update detection (runs in background, surfaces banner if needed)
  _initSWUpdateDetection();
  // Set initial "checking" status in settings card
  setTimeout(() => _setUpdStatus('checking', 'Checking for admin updates…'), 300);

  // ── Firebase Auth state is the single source of truth for routing ──
  _auth.onAuthStateChanged(async (user) => {
    if (user) {
      // Authenticated — wire up Firestore and show the app
      if (!db) initFirestoreListeners();
      await _ensureAdminRole(user);
      _showApp();
      console.log(`[Admin] Signed in as ${user.email}`);
    } else {
      // Not authenticated — show login screen; detach any live listeners
      _fsUnsubs.forEach(u => { try { u(); } catch(_) {} });
      _fsUnsubs.length = 0;
      _showLoginScreen();
    }
  });
})();

/* ═══════════════════════════════════════════════════════════
   USER ROLE MANAGEMENT
═══════════════════════════════════════════════════════════ */
let _urmFilter   = 'all';
let _urmEditUser = null;
let _userRoleOverrides = {};  // { userId: newRole } — persisted to Firestore if available

function setUrmFilter(chip) {
  document.querySelectorAll('#urm-role-filter .chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  _urmFilter = chip.dataset.val;
  renderUsersTable();
}

function renderUsersTable() {
  const q      = (document.getElementById('urm-search')?.value || '').toLowerCase();
  const tbody  = document.getElementById('urm-tbody');
  if (!tbody) return;

  // Build enriched user list from allUsers + session data
  const enriched = allUsers.map(u => {
    const sessions     = allSessions.filter(s => s.userId === u.id);
    const lastSession  = sessions.sort((a, b) => _ts(b) - _ts(a))[0];
    const institution  = lastSession?.institution || u.institution || '—';
    const userName     = lastSession?.userName    || u.userName    || '—';
    const role         = _userRoleOverrides[u.id] || u.userRole    || 'Unknown';
    const lastActive   = lastSession ? _fmtDate(_ts(lastSession)) : '—';
    return { ...u, sessions: sessions.length, institution, userName, role, lastActive };
  });

  const filtered = enriched.filter(u => {
    if (_urmFilter !== 'all' && u.role !== _urmFilter) return false;
    if (q && !u.id.toLowerCase().includes(q) &&
             !u.userName.toLowerCase().includes(q) &&
             !u.institution.toLowerCase().includes(q)) return false;
    return true;
  });

  _set('urm-count-label', filtered.length + ' account' + (filtered.length !== 1 ? 's' : ''));
  _set('nb-users', allUsers.length);

  const roleColors = {
    Dietitian: 'var(--teal)', Clinician: 'var(--blue)', Nurse: 'var(--green)',
    Student: 'var(--amber)', Researcher: 'var(--purple)', Other: 'var(--text-muted)', Unknown: 'var(--text-muted)'
  };

  tbody.innerHTML = filtered.map(u => `
    <tr>
      <td style="font-family:var(--mono);font-size:10px;color:var(--teal)">${_esc(u.id.slice(0,16))}</td>
      <td>${_esc(u.userName)}</td>
      <td>${_esc(u.institution)}</td>
      <td><span style="color:${roleColors[u.role]||'var(--text-muted)'};font-weight:600;font-size:11px">${_esc(u.role)}</span></td>
      <td style="text-align:center">${u.sessions}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--text-dim)">${u.lastActive}</td>
      <td>
        <button class="urm-edit-btn" onclick="openUrmModal('${_esc(u.id)}')">✏ Edit Role</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No accounts match</td></tr>';
}

function openUrmModal(userId) {
  const u = allUsers.find(u => u.id === userId);
  if (!u) return;
  _urmEditUser = userId;
  const currentRole = _userRoleOverrides[userId] || u.userRole || 'Unknown';
  document.getElementById('urm-modal-uid').textContent  = userId;
  document.getElementById('urm-modal-name').textContent = u.userName || '—';
  document.querySelectorAll('#urm-modal-roles .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.val === currentRole);
  });
  document.getElementById('urm-modal').style.display = 'flex';
}

function closeUrmModal(e) {
  if (e && e.target !== document.getElementById('urm-modal')) return;
  document.getElementById('urm-modal').style.display = 'none';
  _urmEditUser = null;
}

function selectUrmRole(chip) {
  document.querySelectorAll('#urm-modal-roles .chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
}

function saveUserRole() {
  if (!_urmEditUser) return;
  const selected = document.querySelector('#urm-modal-roles .chip.active');
  if (!selected) { showToast('Select a role first', 'warn'); return; }
  const newRole = selected.dataset.val;
  _userRoleOverrides[_urmEditUser] = newRole;

  // Persist to Firestore if connected
  if (typeof db !== 'undefined' && USE_FIREBASE) {
    db.collection('userRoles').doc(_urmEditUser).set({ role: newRole, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(() => showToast('Role updated in Firestore ✓', 'success'))
      .catch(() => showToast('Saved locally (Firestore write failed)', 'warn'));
  } else {
    showToast('Role updated (offline mode)', 'info');
  }

  document.getElementById('urm-modal').style.display = 'none';
  _urmEditUser = null;
  renderUsersTable();
}

function _fmtDate(d) {
  if (!d || isNaN(d)) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

/* ═══════════════════════════════════════════════════════════
   ERROR & CRASH LOG
═══════════════════════════════════════════════════════════ */
let _errorLog   = [];   // { level, msg, source, ts }
let _errFilter  = 'all';

// Intercept global JS errors
(function _patchErrorHandlers() {
  window.addEventListener('error', e => {
    _logError('error', e.message || 'Unknown error', e.filename ? (e.filename.split('/').pop() + ':' + e.lineno) : 'window');
  });
  window.addEventListener('unhandledrejection', e => {
    _logError('error', String(e.reason), 'Promise');
  });
  // Also patch console.error and console.warn
  const _origErr  = console.error.bind(console);
  const _origWarn = console.warn.bind(console);
  console.error = (...args) => { _logError('error', args.map(String).join(' '), 'console'); _origErr(...args); };
  console.warn  = (...args) => { _logError('warn',  args.map(String).join(' '), 'console'); _origWarn(...args); };
})();

function _logError(level, msg, source) {
  _errorLog.unshift({ level, msg: String(msg).slice(0, 300), source: source || '—', ts: Date.now() });
  if (_errorLog.length > 200) _errorLog.length = 200;
  _set('nb-errors', _errorLog.filter(e => e.level === 'error').length || '');
  // Re-render if tab is visible
  if (document.getElementById('tab-errors')?.classList.contains('active')) renderErrorLog();
}

function setErrFilter(chip) {
  document.querySelectorAll('#err-level-filter .chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  _errFilter = chip.dataset.val;
  renderErrorLog();
}

function renderErrorLog() {
  const wrap = document.getElementById('err-log-wrap');
  if (!wrap) return;
  const filtered = _errFilter === 'all' ? _errorLog : _errorLog.filter(e => e.level === _errFilter);
  _set('err-count-label', filtered.length + ' entr' + (filtered.length === 1 ? 'y' : 'ies'));
  document.getElementById('err-empty').style.display = filtered.length ? 'none' : 'block';

  const icons = { error: '🔴', warn: '🟡', info: '🔵' };
  const colors = { error: 'var(--red)', warn: 'var(--amber)', info: 'var(--blue)' };

  const existing = wrap.querySelectorAll('.err-entry');
  existing.forEach(e => e.remove());

  filtered.forEach(entry => {
    const el = document.createElement('div');
    el.className = 'err-entry err-' + entry.level;
    const t = new Date(entry.ts);
    const time = t.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const date = t.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
    el.innerHTML = `
      <div class="err-meta">
        <span class="err-icon">${icons[entry.level] || '⚪'}</span>
        <span class="err-level-badge" style="color:${colors[entry.level]||'inherit'}">${entry.level.toUpperCase()}</span>
        <span class="err-source">${_esc(entry.source)}</span>
        <span class="err-time">${date} ${time}</span>
      </div>
      <div class="err-msg">${_esc(entry.msg)}</div>
    `;
    wrap.appendChild(el);
  });
}

function clearErrorLog() {
  if (!confirm('Clear all ' + _errorLog.length + ' log entries?')) return;
  _errorLog = [];
  _set('nb-errors', '');
  renderErrorLog();
  showToast('Error log cleared', 'info');
}

// Seed a few demo log entries so the tab isn't empty on first load
setTimeout(() => {
  _logError('info',  'Admin dashboard initialised', 'app.js');
  _logError('info',  'Firestore listeners attached', 'app.js');
}, 500);

/* ═══════════════════════════════════════════════════════════
   OFFLINE USAGE TRACKER
═══════════════════════════════════════════════════════════ */
function renderOfflineTab() {
  const total    = allSessions.length;
  // Sessions flagged offline: check for isOffline flag, or fallback: sessionId starts with 'offline_'
  const offlineSessions = allSessions.filter(s =>
    s.isOffline === true || s.offline === true || (s.sessionId || '').startsWith('offline_')
  );
  const onlineCount  = total - offlineSessions.length;
  const offlineRate  = total > 0 ? ((offlineSessions.length / total) * 100).toFixed(1) + '%' : '—';

  _set('off-total',  total);
  _set('off-count',  offlineSessions.length);
  _set('off-online', onlineCount);
  _set('off-rate',   offlineRate);

  // Per-institution breakdown
  const instMap = {};
  allSessions.forEach(s => {
    const inst = s.institution || 'Unknown';
    if (!instMap[inst]) instMap[inst] = { total: 0, offline: 0 };
    instMap[inst].total++;
    if (s.isOffline === true || s.offline === true || (s.sessionId || '').startsWith('offline_'))
      instMap[inst].offline++;
  });

  const instList = document.getElementById('off-inst-list');
  if (instList) {
    const sorted = Object.entries(instMap).sort((a, b) => b[1].total - a[1].total);
    instList.innerHTML = sorted.map(([name, d]) => {
      const pct = d.total > 0 ? (d.offline / d.total * 100).toFixed(0) : 0;
      const barColor = pct >= 60 ? 'var(--red)' : pct >= 30 ? 'var(--amber)' : 'var(--teal)';
      return `
        <div class="off-inst-row">
          <div class="off-inst-name">${_esc(name)}</div>
          <div class="off-inst-stats">
            <span class="off-inst-num">${d.offline} offline</span>
            <span class="off-inst-sep">/</span>
            <span class="off-inst-total">${d.total} total</span>
          </div>
          <div class="off-bar-track">
            <div class="off-bar-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>
          <div class="off-pct">${pct}%</div>
        </div>
      `;
    }).join('') || '<div style="color:var(--text-muted);font-size:12px;padding:12px">No session data yet.</div>';
  }

  // Recent offline sessions table
  const tbody = document.getElementById('off-tbody');
  if (tbody) {
    const recent = offlineSessions.slice(0, 50);
    tbody.innerHTML = recent.map(s => `
      <tr>
        <td style="font-family:var(--mono);font-size:10px;color:var(--amber)">${_esc((s.sessionId||'—').slice(0,16))}</td>
        <td>${_esc(s.userName || s.userId || '—')}</td>
        <td>${_esc(s.institution || '—')}</td>
        <td>${_esc(s.module || '—')}</td>
        <td style="font-family:var(--mono);font-size:10px">${_fmtDate(_ts(s))}</td>
        <td><span style="color:var(--amber);font-size:10px;font-weight:700">📴 OFFLINE</span></td>
      </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No offline sessions found</td></tr>';
  }
}

/* ═══════════════════════════════════════════════════════════
   DEVELOPER PROFILE
═══════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────
let _devCroppedPhoto = '';   // final base64 string (400×400)
let _devCropImage    = null; // HTMLImageElement for crop editor
let _devCropX        = 0;
let _devCropY        = 0;
let _devDragStart    = null;

// ── Load from Firestore & pre-fill ─────────────────────────
async function devLoadProfile() {
  try {
    const db   = firebase.firestore();
    const snap = await db.collection('app_config').doc('developer_profile').get();
    if (!snap.exists) return;
    const d = snap.data();
    _safeSet('dev-name',        d.name        || '');
    _safeSet('dev-role',        d.role        || '');
    _safeSet('dev-institution', d.institution || '');
    _safeSet('dev-bio',         d.bio         || '');
    _safeSet('dev-email',       (d.links && d.links.email)    || '');
    _safeSet('dev-github',      (d.links && d.links.github)   || '');
    _safeSet('dev-linkedin',    (d.links && d.links.linkedin) || '');
    _safeSet('dev-twitter',     (d.links && d.links.twitter)  || '');
    if (d.photo) {
      _devCroppedPhoto = d.photo;
      _devApplyAvatarPreview(d.photo);
    }
  } catch (e) {
    console.warn('[DevProfile] Load error:', e);
  }
}

function _safeSet(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function _devApplyAvatarPreview(base64) {
  const img  = document.getElementById('dev-avatar-img');
  const ph   = document.querySelector('.dev-avatar-placeholder');
  const rmbtn = document.getElementById('dev-remove-photo');
  if (!img) return;
  if (base64) {
    img.src = base64;
    img.style.display = 'block';
    if (ph)    ph.style.display = 'none';
    if (rmbtn) rmbtn.style.display = '';
  } else {
    img.src = '';
    img.style.display = 'none';
    if (ph)    ph.style.display = '';
    if (rmbtn) rmbtn.style.display = 'none';
  }
}

// ── Save to Firestore ───────────────────────────────────────
async function devSaveProfile() {
  const btn = document.getElementById('dev-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }
  try {
    const db   = firebase.firestore();
    const data = {
      name:        (document.getElementById('dev-name')?.value        || '').trim(),
      role:        (document.getElementById('dev-role')?.value        || '').trim(),
      institution: (document.getElementById('dev-institution')?.value || '').trim(),
      bio:         (document.getElementById('dev-bio')?.value         || '').trim(),
      photo:       _devCroppedPhoto || '',
      links: {
        email:    (document.getElementById('dev-email')?.value    || '').trim(),
        github:   (document.getElementById('dev-github')?.value   || '').trim(),
        linkedin: (document.getElementById('dev-linkedin')?.value || '').trim(),
        twitter:  (document.getElementById('dev-twitter')?.value  || '').trim(),
      }
    };
    await db.collection('app_config').doc('developer_profile').set(data, { merge: true });
    showToast('Developer profile saved ✓', 'success');
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 SAVE DEVELOPER PROFILE →'; }
  }
}

// ── Remove photo ────────────────────────────────────────────
function devRemovePhoto() {
  _devCroppedPhoto = '';
  _devApplyAvatarPreview('');
}

// ═══════════════════════════════════════════════════════════
// CROP EDITOR
// ═══════════════════════════════════════════════════════════

function devOpenCrop(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  // Reset input so same file can be re-selected
  event.target.value = '';

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      _devCropImage = img;
      _devCropX = 0;
      _devCropY = 0;
      document.getElementById('dev-zoom-slider').value   = 100;
      document.getElementById('dev-rotate-slider').value = 0;
      document.getElementById('dev-zoom-val').textContent   = '100%';
      document.getElementById('dev-rotate-val').textContent = '0°';
      document.getElementById('dev-crop-overlay').style.display = 'flex';
      requestAnimationFrame(devDrawCrop);
      _devBindCropDrag();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function devCloseCrop() {
  document.getElementById('dev-crop-overlay').style.display = 'none';
  _devCropImage = null;
  _devUnbindCropDrag();
}

function devUpdateCrop() {
  const zoomEl  = document.getElementById('dev-zoom-slider');
  const rotEl   = document.getElementById('dev-rotate-slider');
  document.getElementById('dev-zoom-val').textContent   = zoomEl.value  + '%';
  document.getElementById('dev-rotate-val').textContent = rotEl.value   + '°';
  devDrawCrop();
}

function devDrawCrop() {
  const canvas = document.getElementById('dev-crop-canvas');
  if (!canvas || !_devCropImage) return;
  const stage = canvas.parentElement;
  const size  = stage.clientWidth || 400;
  canvas.width  = size;
  canvas.height = size;
  const ctx   = canvas.getContext('2d');
  const zoom  = parseFloat(document.getElementById('dev-zoom-slider').value)  / 100;
  const angle = parseFloat(document.getElementById('dev-rotate-slider').value) * Math.PI / 180;
  const iw = _devCropImage.naturalWidth;
  const ih = _devCropImage.naturalHeight;
  const scale = Math.min(size / iw, size / ih) * zoom;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2 + _devCropX, size / 2 + _devCropY);
  ctx.rotate(angle);
  ctx.drawImage(_devCropImage, -iw * scale / 2, -ih * scale / 2, iw * scale, ih * scale);
  ctx.restore();
}

// ── Drag to reposition ──────────────────────────────────────
function _devBindCropDrag() {
  const stage = document.getElementById('dev-crop-canvas');
  if (!stage) return;
  stage.addEventListener('mousedown',  _devDragDown);
  stage.addEventListener('touchstart', _devDragDown, { passive: true });
}

function _devUnbindCropDrag() {
  const stage = document.getElementById('dev-crop-canvas');
  if (!stage) return;
  stage.removeEventListener('mousedown',  _devDragDown);
  stage.removeEventListener('touchstart', _devDragDown);
  document.removeEventListener('mousemove', _devDragMove);
  document.removeEventListener('mouseup',   _devDragUp);
  document.removeEventListener('touchmove', _devDragMove);
  document.removeEventListener('touchend',  _devDragUp);
}

function _devDragDown(e) {
  const pt = e.touches ? e.touches[0] : e;
  _devDragStart = { x: pt.clientX - _devCropX, y: pt.clientY - _devCropY };
  document.addEventListener('mousemove', _devDragMove);
  document.addEventListener('mouseup',   _devDragUp);
  document.addEventListener('touchmove', _devDragMove, { passive: true });
  document.addEventListener('touchend',  _devDragUp);
}

function _devDragMove(e) {
  if (!_devDragStart) return;
  const pt   = e.touches ? e.touches[0] : e;
  _devCropX  = pt.clientX - _devDragStart.x;
  _devCropY  = pt.clientY - _devDragStart.y;
  devDrawCrop();
}

function _devDragUp() {
  _devDragStart = null;
  document.removeEventListener('mousemove', _devDragMove);
  document.removeEventListener('mouseup',   _devDragUp);
  document.removeEventListener('touchmove', _devDragMove);
  document.removeEventListener('touchend',  _devDragUp);
}

// ── Save crop → 400×400 JPEG base64 ────────────────────────
function devSaveCrop() {
  const srcCanvas = document.getElementById('dev-crop-canvas');
  if (!srcCanvas || !_devCropImage) return;

  // Re-draw at 400×400 centred on the circle crop region
  const OUT   = 400;
  const stage = srcCanvas.parentElement;
  const stageSize = stage.clientWidth || 400;
  const ringDiam  = stageSize * 0.70; // matches CSS .dev-crop-ring width: 70%
  const scale     = OUT / ringDiam;

  const out = document.createElement('canvas');
  out.width = out.height = OUT;
  const ctx = out.getContext('2d');

  // Clip to circle
  ctx.beginPath();
  ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2);
  ctx.clip();

  // Draw the same transform but scaled up to 400px
  const zoom  = parseFloat(document.getElementById('dev-zoom-slider').value)  / 100;
  const angle = parseFloat(document.getElementById('dev-rotate-slider').value) * Math.PI / 180;
  const iw    = _devCropImage.naturalWidth;
  const ih    = _devCropImage.naturalHeight;
  const imgScale = Math.min(stageSize / iw, stageSize / ih) * zoom * scale;

  ctx.save();
  ctx.translate(OUT / 2 + _devCropX * scale, OUT / 2 + _devCropY * scale);
  ctx.rotate(angle);
  ctx.drawImage(_devCropImage, -iw * imgScale / 2, -ih * imgScale / 2, iw * imgScale, ih * imgScale);
  ctx.restore();

  // Prefer WebP, fall back to JPEG
  let b64 = '';
  try { b64 = out.toDataURL('image/webp', 0.88); } catch (_) {}
  if (!b64 || b64 === 'data:,') { b64 = out.toDataURL('image/jpeg', 0.88); }

  _devCroppedPhoto = b64;
  _devApplyAvatarPreview(b64);
  devCloseCrop();
  showToast('Photo cropped — remember to Save Profile ✓', 'info');
}
