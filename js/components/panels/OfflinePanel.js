import { store } from '../../state.js';

function isOffline(s) {
  return s.isOffline === true || s.offline === true || (s.sessionId || '').startsWith('offline_');
}

export default {
  name: 'OfflinePanel',
  computed: {
    store() { return store; },
    offlineSessions() { return store.allSessions.filter(isOffline); },
    kpis() {
      const total = store.allSessions.length;
      const offline = this.offlineSessions.length;
      return {
        total, offline, online: total - offline,
        rate: total > 0 ? ((offline / total) * 100).toFixed(1) + '%' : '—',
      };
    },
    instRows() {
      const map = {};
      store.allSessions.forEach(s => {
        const inst = s.institution || 'Unknown';
        if (!map[inst]) map[inst] = { total: 0, offline: 0 };
        map[inst].total++;
        if (isOffline(s)) map[inst].offline++;
      });
      return Object.entries(map).sort((a, b) => b[1].total - a[1].total).map(([name, d]) => {
        const pct = d.total > 0 ? Math.round((d.offline / d.total) * 100) : 0;
        const barColor = pct >= 60 ? 'var(--red)' : pct >= 30 ? 'var(--amber)' : 'var(--teal)';
        return { name, ...d, pct, barColor };
      });
    },
    recent() { return this.offlineSessions.slice(0, 50); },
  },
  methods: {
    fmtDate(s) {
      const t = s.startedAt || s.timestamp;
      if (!t) return '—';
      const d = t.toDate ? t.toDate() : new Date(t);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    },
  },
  template: `
    <div class="tab-pane active">
      <div class="content-header"><div class="page-title">Offline Usage <span>Connectivity tracker</span></div></div>
      <div class="kpi-grid" style="margin-bottom:18px">
        <div class="kpi-card c-teal"  data-icon="📋"><div class="kpi-label">Total Sessions</div><div class="kpi-val">{{ kpis.total }}</div><div class="kpi-sub">All time</div></div>
        <div class="kpi-card c-amber" data-icon="📶"><div class="kpi-label">Offline Sessions</div><div class="kpi-val">{{ kpis.offline }}</div><div class="kpi-sub">No connectivity</div></div>
        <div class="kpi-card c-green" data-icon="🌐"><div class="kpi-label">Online Sessions</div><div class="kpi-val">{{ kpis.online }}</div><div class="kpi-sub">Connected</div></div>
        <div class="kpi-card c-blue"  data-icon="%"><div class="kpi-label">Offline Rate</div><div class="kpi-val">{{ kpis.rate }}</div><div class="kpi-sub">% of all sessions</div></div>
      </div>
      <div class="section-hdr"><span class="section-title">By Institution</span><div class="section-line"></div></div>
      <div class="off-inst-list">
        <div v-if="!instRows.length" style="color:var(--text-muted);font-size:12px;padding:12px">No session data yet.</div>
        <div v-for="r in instRows" :key="r.name" class="off-inst-row">
          <div class="off-inst-name">{{ r.name }}</div>
          <div class="off-inst-stats">
            <span class="off-inst-num">{{ r.offline }} offline</span>
            <span class="off-inst-sep">/</span>
            <span class="off-inst-total">{{ r.total }} total</span>
          </div>
          <div class="off-bar-track"><div class="off-bar-fill" :style="{width: r.pct + '%', background: r.barColor}"></div></div>
          <div class="off-pct">{{ r.pct }}%</div>
        </div>
      </div>
      <div class="section-hdr" style="margin-top:18px"><span class="section-title">Recent Offline Sessions</span><div class="section-line"></div></div>
      <div class="urm-table-wrap">
        <table class="urm-table">
          <thead><tr><th>Session ID</th><th>User</th><th>Institution</th><th>Module</th><th>Date</th><th>Mode</th></tr></thead>
          <tbody>
            <tr v-if="!recent.length"><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No offline sessions found</td></tr>
            <tr v-for="s in recent" :key="s.id">
              <td style="font-family:var(--mono);font-size:10px;color:var(--amber)">{{ (s.sessionId||'—').slice(0,16) }}</td>
              <td>{{ s.userName || s.userId || '—' }}</td>
              <td>{{ s.institution || '—' }}</td>
              <td>{{ s.module || '—' }}</td>
              <td style="font-family:var(--mono);font-size:10px">{{ fmtDate(s) }}</td>
              <td><span style="color:var(--amber);font-size:10px;font-weight:700">📴 OFFLINE</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
};
