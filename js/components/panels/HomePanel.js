import { store, homeStats, switchTab, pushLog, pushUpdateToClients } from '../../state.js';

export default {
  name: 'HomePanel',
  data() { return { version: '', notes: '' }; },
  computed: {
    store() { return store; },
    stats() { return homeStats(); },
    pushLog() { return pushLog; },
  },
  methods: {
    go(tab) { switchTab(tab); },
    async push() {
      await pushUpdateToClients(this.version, this.notes);
      if (pushLog.lines.some(l => l.startsWith('✓ Update'))) { this.version = ''; this.notes = ''; }
    },
  },
  template: `
    <div class="tab-pane active" id="tab-home">
      <div class="hero-section">
        <div class="hero-eyebrow">Oasis</div>
        <div class="hero-title">Admin <span>Console</span></div>
        <div class="hero-sub">Monitor sessions, track active users, and review clinical feedback across all registered institutions.</div>
        <div class="hero-badges">
          <div class="sys-badge" :class="store.dbStatus==='ok' ? 'ok' : store.dbStatus==='error' ? 'err' : 'warn'">
            <span class="sd"></span>
            <span>{{ store.dbStatus==='ok' ? 'Connected to Firestore' : store.dbStatus==='error' ? 'Firestore connection error' : 'Connecting to Firestore…' }}</span>
          </div>
          <div class="sys-badge ok"><span class="sd"></span> 7 Modules Active</div>
          <div class="sys-badge warn"><span class="sd"></span> Cloud Firestore</div>
        </div>
      </div>

      <div class="section-hdr"><span class="section-title">Quick Stats</span><div class="section-line"></div></div>
      <div class="kpi-grid">
        <div class="kpi-card c-teal"   data-icon="📋"><div class="kpi-label">Total Sessions</div><div class="kpi-val">{{ stats.totalSessions }}</div><div class="kpi-sub">All time</div></div>
        <div class="kpi-card c-green"  data-icon="👥"><div class="kpi-label">Now Online</div><div class="kpi-val">{{ stats.nowOnline }}</div><div class="kpi-sub">Presence heartbeat</div></div>
        <div class="kpi-card c-amber"  data-icon="⚗️"><div class="kpi-label">Calculations</div><div class="kpi-val">{{ stats.totalCalcs }}</div><div class="kpi-sub">All time</div></div>
        <div class="kpi-card c-blue"   data-icon="💬"><div class="kpi-label">Feedback</div><div class="kpi-val">{{ stats.feedbackCount }}</div><div class="kpi-sub">Total submitted</div></div>
        <div class="kpi-card c-purple" data-icon="🏥"><div class="kpi-label">Institutions</div><div class="kpi-val">{{ stats.institutions }}</div><div class="kpi-sub">Unique sites</div></div>
        <div class="kpi-card c-indigo" data-icon="👤"><div class="kpi-label">Registered Accounts</div><div class="kpi-val">{{ stats.totalAccounts }}</div><div class="kpi-sub">All time</div></div>
        <div class="kpi-card c-rose"   data-icon="✨"><div class="kpi-label">New Accounts</div><div class="kpi-val">{{ stats.newAccounts24h }}</div><div class="kpi-sub">Last 24 hours</div></div>
      </div>

      <div class="section-hdr"><span class="section-title">Quick Navigation</span><div class="section-line"></div></div>
      <div class="quick-nav-grid">
        <div class="qnav-card" @click="go('analytics')">
          <div class="qnav-icon" style="background:rgba(29,233,212,0.08)">📈</div>
          <div class="qnav-text"><div class="qn-label">Analytics</div><div class="qn-sub">Live users · Devices</div></div>
          <div class="qnav-arr">→</div>
        </div>
        <div class="qnav-card" @click="go('sessions')">
          <div class="qnav-icon" style="background:rgba(96,165,250,0.08)">📋</div>
          <div class="qnav-text"><div class="qn-label">Sessions</div><div class="qn-sub">Browse · Search · Export</div></div>
          <div class="qnav-arr">→</div>
        </div>
        <div class="qnav-card" @click="go('feedback')">
          <div class="qnav-icon" style="background:rgba(167,139,250,0.08)">💬</div>
          <div class="qnav-text"><div class="qn-label">Feedback</div><div class="qn-sub">User messages · Reactions</div></div>
          <div class="qnav-arr">→</div>
        </div>
        <div class="qnav-card" @click="go('settings')">
          <div class="qnav-icon" style="background:rgba(240,180,41,0.08)">⚙️</div>
          <div class="qnav-text"><div class="qn-label">Settings</div><div class="qn-sub">Appearance · Security</div></div>
          <div class="qnav-arr">→</div>
        </div>
      </div>

      <div class="section-hdr"><span class="section-title">Client Release</span><div class="section-line"></div></div>
      <div class="upd-mgr-card">
        <div class="upd-mgr-hdr">
          🚀 Push Release to Oasis
          <span class="upd-ver-badge" style="background:rgba(240,180,41,0.12);border-color:rgba(240,180,41,0.35);color:var(--amber)">CLIENT</span>
        </div>
        <div class="push-upd-section" style="padding-top:14px">
          <div class="push-upd-label">Broadcast a new version + release notes to all active clients</div>
          <div class="push-upd-row">
            <input class="push-upd-input" placeholder="e.g. 1.2.2" v-model="version" maxlength="20" spellcheck="false">
            <textarea class="push-upd-textarea" placeholder="Release notes… (shown to users in update prompt)" v-model="notes"></textarea>
          </div>
          <button class="push-upd-btn" :disabled="pushLog.busy" @click="push">
            <span>🚀</span> {{ pushLog.busy ? 'PUSHING…' : 'PUSH RELEASE TO ALL CLIENTS' }}
          </button>
          <div class="push-upd-log">
            <span v-for="(line, i) in pushLog.lines" :key="i" class="log-info">{{ line }}<br></span>
          </div>
        </div>
      </div>
    </div>
  `,
};
