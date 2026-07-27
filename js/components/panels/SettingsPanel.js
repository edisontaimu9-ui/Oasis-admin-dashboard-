import { appearance, setSetting, BG_PREVIEWS } from '../../appearance.js';
import { store, auth } from '../../state.js';
import { showToast } from '../Toast.js';

const THEME_CHIPS = [['dark', '🌙 Dark'], ['light', '☀️ Light'], ['amoled', '⬛ AMOLED'], ['hc', '♿ HC'], ['auto', '💻 Auto']];
const ACCENTS = [['#1de9d4', 'Teal'], ['#f0b429', 'Amber'], ['#60a5fa', 'Blue'], ['#a78bfa', 'Purple'], ['#34d399', 'Green'], ['#fb7185', 'Rose'], ['#f97316', 'Orange'], ['#e879f9', 'Pink']];
const TYPEFACES = ['Barlow', 'Space Grotesk', 'Inter', 'DM Sans', 'Nunito', 'Syne'];
const BG_OPTIONS = [
  ['none', 'None'], ['grid', 'Grid'], ['dots', 'Dots'], ['lines', 'Lines'], ['circuit', 'Circuit'],
  ['blueprint', 'Blueprint'], ['aurora', 'Aurora'], ['midnight', 'Midnight'], ['forest', 'Forest'],
  ['ember', 'Ember'], ['topo', 'Topo'], ['linen', 'Linen'],
];

function pwdStrength(val) {
  if (!val) return { pct: '0%', color: '', hint: 'Enter a new password' };
  let score = 0;
  if (val.length >= 8) score++;
  if (val.length >= 12) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const levels = [
    { pct: '20%', color: '#fb7185', hint: 'Weak' }, { pct: '40%', color: '#fb7185', hint: 'Weak' },
    { pct: '60%', color: '#f0b429', hint: 'Fair' }, { pct: '80%', color: '#60a5fa', hint: 'Good' },
    { pct: '100%', color: '#34d399', hint: 'Strong' },
  ];
  return levels[Math.min(score, 5) - 1] || levels[0];
}

export default {
  name: 'SettingsPanel',
  data() {
    return { pwdCurrent: '', pwdNew: '', pwdConfirm: '', pwdMsg: '', pwdMsgColor: '', customAccent: '#1de9d4' };
  },
  computed: {
    appearance() { return appearance; },
    store() { return store; },
    THEME_CHIPS() { return THEME_CHIPS; }, ACCENTS() { return ACCENTS; }, TYPEFACES() { return TYPEFACES; }, BG_OPTIONS() { return BG_OPTIONS; },
    strength() { return pwdStrength(this.pwdNew); },
    isCustomAccent() { return !ACCENTS.some(a => a[0] === appearance.accent); },
    kpis() {
      const s = store.allCalculations;
      let topMod = '—', topCount = 0;
      for (const [k, v] of Object.entries(store.globalStats)) {
        if (k.startsWith('module_') && v > topCount) { topCount = v; topMod = k.replace('module_', ''); }
      }
      return {
        totalCalcs: s.length,
        topMod: topMod === '—' ? '—' : topMod.charAt(0).toUpperCase() + topMod.slice(1),
        usersCount: store.allUsers.length,
      };
    },
  },
  methods: {
    setSetting,
    bgPreviewStyle(key) {
      const p = BG_PREVIEWS[key];
      if (!p) return {};
      return { background: p.bg, backgroundImage: p.overlay, backgroundSize: p.size || 'auto', backgroundPosition: p.pos || '0 0' };
    },
    toggleLandscape(checked) {
      this.allowLandscape = checked;
      if (window.OasisOrientation) {
        if (checked) window.OasisOrientation.enableLandscape();
        else window.OasisOrientation.disableLandscape();
      }
      showToast(checked ? 'Landscape rotation enabled' : 'Locked to portrait', 'success');
    },
    async changePassword() {
      this.pwdMsgColor = 'var(--red)';
      if (!this.pwdCurrent || !this.pwdNew || !this.pwdConfirm) { this.pwdMsg = '⚠ All fields are required.'; return; }
      if (this.pwdNew.length < 8) { this.pwdMsg = '⚠ Minimum 8 characters required.'; return; }
      if (this.pwdNew !== this.pwdConfirm) { this.pwdMsg = '✗ New passwords do not match.'; return; }
      if (this.pwdCurrent === this.pwdNew) { this.pwdMsg = '⚠ New password must differ from current.'; return; }
      const user = auth.currentUser;
      if (!user) { this.pwdMsg = '✗ Not authenticated. Please log in again.'; return; }
      try {
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, this.pwdCurrent);
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(this.pwdNew);
        this.pwdCurrent = ''; this.pwdNew = ''; this.pwdConfirm = '';
        this.pwdMsgColor = 'var(--green)'; this.pwdMsg = '✓ Password updated successfully.';
        showToast('Admin password updated', 'success');
        setTimeout(() => { this.pwdMsg = ''; }, 4000);
      } catch (err) {
        const map = {
          'auth/wrong-password': '✗ Current password is incorrect.', 'auth/invalid-credential': '✗ Current password is incorrect.',
          'auth/weak-password': '⚠ New password is too weak (min 6 chars).', 'auth/requires-recent-login': '⚠ Session expired — please log out and log in again.',
          'auth/too-many-requests': '⚠ Too many attempts. Try again later.',
        };
        this.pwdMsg = map[err.code] || `✗ Error: ${err.message}`;
      }
    },
  },
  template: `
    <div class="tab-pane active">
      <div class="stg-page-title">⚙️ Settings</div>
      <div class="stg-two-col">
        <!-- LEFT: Appearance -->
        <div class="stg-col">
          <div class="stg-card">
            <div class="stg-card-hdr">🎨 Appearance</div>
            <div class="stg-row">
              <span class="stg-lbl">Theme</span>
              <div class="chip-group">
                <div v-for="t in THEME_CHIPS" :key="t[0]" class="chip" :class="{active: appearance.theme===t[0]}" @click="setSetting('theme', t[0])">{{ t[1] }}</div>
              </div>
            </div>
            <div class="stg-row">
              <span class="stg-lbl">Accent</span>
              <div class="accent-picker">
                <div v-for="a in ACCENTS" :key="a[0]" class="accent-swatch" :class="{active: appearance.accent===a[0]}" :style="{background: a[0]}" :title="a[1]" @click="setSetting('accent', a[0])"></div>
                <label class="accent-custom-wrap" title="Custom colour">
                  <div class="accent-swatch accent-swatch-conic" :class="{active: isCustomAccent}" :style="isCustomAccent ? {background: appearance.accent} : {}">＋</div>
                  <input type="color" v-model="customAccent" @input="setSetting('accent', customAccent)" style="position:absolute;opacity:0;width:0;height:0">
                </label>
              </div>
            </div>
            <div class="stg-row">
              <span class="stg-lbl">Text</span>
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                <div class="chip-group">
                  <div class="chip" :class="{active: appearance.textIntensity==='soft'}" @click="setSetting('textIntensity','soft')">Soft</div>
                  <div class="chip" :class="{active: appearance.textIntensity==='normal'}" @click="setSetting('textIntensity','normal')">Normal</div>
                  <div class="chip" :class="{active: appearance.textIntensity==='strong'}" @click="setSetting('textIntensity','strong')">Strong</div>
                </div>
                <div class="chip-group">
                  <div class="chip" :class="{active: appearance.textSize==='s'}" @click="setSetting('textSize','s')">S</div>
                  <div class="chip" :class="{active: appearance.textSize==='m'}" @click="setSetting('textSize','m')">M</div>
                  <div class="chip" :class="{active: appearance.textSize==='l'}" @click="setSetting('textSize','l')">L</div>
                  <div class="chip" :class="{active: appearance.textSize==='xl'}" @click="setSetting('textSize','xl')">XL</div>
                </div>
              </div>
            </div>
            <div class="stg-row" style="border-bottom:none">
              <span class="stg-lbl">Compact</span>
              <label class="toggle-switch">
                <input type="checkbox" :checked="appearance.compact" @change="setSetting('compact', $event.target.checked)">
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </label>
            </div>
          </div>

          <div class="stg-card">
            <div class="stg-card-hdr">🔤 Typeface</div>
            <div style="padding:10px 14px">
              <div class="typeface-grid">
                <div v-for="f in TYPEFACES" :key="f" class="typeface-card" :class="{active: appearance.typeface===f}" @click="setSetting('typeface', f)">
                  <div class="tf-name" :style="{fontFamily: \`'\${f}',sans-serif\`}">{{ f==='Space Grotesk' ? 'Grotesk' : f }}</div>
                  <div class="tf-sample" :style="{fontFamily: \`'\${f}',sans-serif\`}">Aa 01</div>
                  <div v-if="f==='Barlow'" class="tf-tag">Default</div>
                </div>
              </div>
            </div>
          </div>

          <div class="stg-card">
            <div class="stg-card-hdr">🖼 Background</div>
            <div style="padding:10px 14px">
              <div class="bg-grid-picker">
                <div v-for="b in BG_OPTIONS" :key="b[0]" class="bg-option" :class="{active: appearance.bg===b[0]}" @click="setSetting('bg', b[0])">
                  <div class="bg-preview" :style="b[0]==='none' ? {background:'#020510',display:'flex',alignItems:'center',justifyContent:'center',color:'#3d5070',fontSize:'14px'} : (b[0]==='aurora' ? {background:'linear-gradient(125deg,rgba(29,233,212,0.25),rgba(96,165,250,0.2),rgba(167,139,250,0.2),rgba(240,180,41,0.18))'} : (b[0]==='ember' ? {background:'radial-gradient(ellipse at 40% 60%,rgba(249,115,22,0.35),transparent 60%),radial-gradient(ellipse at 70% 30%,rgba(251,113,133,0.25),transparent 55%),#0d0504'} : bgPreviewStyle(b[0])))">{{ b[0]==='none' ? '—' : '' }}</div>
                  <div class="bg-label">{{ b[1] }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Security + System -->
        <div class="stg-col">
          <div class="stg-card" style="margin-bottom:12px">
            <div class="stg-card-hdr">🔒 Admin Password</div>
            <div style="padding:12px 14px">
              <div class="pwd-field"><label>Current Password</label><input type="password" v-model="pwdCurrent" placeholder="Current password…" autocomplete="current-password"></div>
              <div class="pwd-field">
                <label>New Password</label>
                <input type="password" v-model="pwdNew" placeholder="New password…" autocomplete="new-password">
                <div class="pwd-strength-bar"><div class="pwd-strength-fill" :style="{width: strength.pct, background: strength.color}"></div></div>
                <div class="pwd-hint" :style="{color: strength.color}">{{ strength.hint }}</div>
              </div>
              <div class="pwd-field"><label>Confirm Password</label><input type="password" v-model="pwdConfirm" placeholder="Confirm new password…" autocomplete="new-password"></div>
              <div class="pwd-actions">
                <button class="pwd-save-btn" @click="changePassword">SAVE PASSWORD →</button>
                <span class="pwd-msg" :style="{color: pwdMsgColor}">{{ pwdMsg }}</span>
              </div>
            </div>
          </div>

          <div class="stg-card" style="margin-bottom:12px">
            <div class="stg-card-hdr">📱 Orientation</div>
            <div class="stg-row" style="border-bottom:none">
              <span class="stg-lbl">Allow Landscape</span>
              <label class="toggle-switch">
                <input type="checkbox" :checked="allowLandscape" @change="toggleLandscape($event.target.checked)">
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </label>
            </div>
          </div>

          <div class="stg-card" style="margin-bottom:12px">
            <div class="stg-card-hdr">💾 Storage &amp; System</div>
            <div class="stg-mini-stats">
              <div class="stg-mini-stat c-amber"><div class="sms-val">{{ kpis.totalCalcs }}</div><div class="sms-lbl">Calcs</div></div>
              <div class="stg-mini-stat c-teal"><div class="sms-val" style="font-size:10px">{{ kpis.topMod }}</div><div class="sms-lbl">Top Module</div></div>
              <div class="stg-mini-stat c-blue"><div class="sms-val">7</div><div class="sms-lbl">Modules</div></div>
              <div class="stg-mini-stat c-green"><div class="sms-val">{{ kpis.usersCount }}</div><div class="sms-lbl">Users</div></div>
            </div>
            <div class="stg-info-rows">
              <div class="stg-info-row"><span class="stat-key">Storage</span><span class="stat-val" style="font-size:9px">Cloud Firestore</span></div>
              <div class="stg-info-row"><span class="stat-key">Project</span><span class="stat-val">nutri-track-pro-c11c5</span></div>
              <div class="stg-info-row"><span class="stat-key">Status</span><span class="stat-val"><span class="badge badge-teal">{{ store.dbStatus === 'ok' ? '● Firestore Live' : store.dbStatus === 'error' ? '● Error' : '● Connecting…' }}</span></span></div>
              <div class="stg-info-row"><span class="stat-key">Version</span><span class="stat-val">1.0.0 · April 2026</span></div>
              <div class="stg-info-row"><span class="stat-key">Environment</span><span class="stat-val"><span class="badge badge-teal">Cloud · Firebase</span></span></div>
            </div>
          </div>

          <div class="stg-card">
            <div class="stg-card-hdr">🔥 Firestore Collections</div>
            <div style="padding:10px 14px 6px">
              <div class="collection-tags" style="margin-bottom:8px">
                <span class="coll-tag active">sessions</span><span class="coll-tag active">users</span>
                <span class="coll-tag active">feedback</span><span class="coll-tag active">calculations</span>
                <span class="coll-tag warm">presence</span><span class="coll-tag active">stats</span>
              </div>
              <div style="font-family:var(--mono);font-size:9px;color:var(--text-muted);margin-bottom:10px;display:flex;gap:10px">
                <span><span style="color:var(--teal)">■</span> Live listener</span>
                <span><span style="color:var(--amber)">■</span> Heartbeat</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
};
