import { store } from '../../state.js';
import { presenceCounts, liveUserRows, deviceIcon, deviceLabel, ago } from '../../utils.js';

export default {
  name: 'OnlinePanel',
  computed: {
    store() { return store; },
    active() { return presenceCounts(store.allPresence); },
    liveRows() { return liveUserRows(store.allPresence); },
  },
  methods: { deviceIcon, deviceLabel, ago },
  template: `
    <div class="tab-pane active">
      <div class="content-header"><div class="page-title">Online <span>{{ active.now }} online now</span></div></div>
      <div class="section-hdr"><span class="section-title">Active Users</span><div class="section-line"></div></div>
      <div class="activity-kpi-grid">
        <div class="act-kpi"><div class="act-kpi-num" style="color:var(--green)">{{ active.now }}</div><div class="act-kpi-label">Now Online</div></div>
        <div class="act-kpi"><div class="act-kpi-num" style="color:var(--teal)">{{ active.m30 }}</div><div class="act-kpi-label">Last 30 min</div></div>
        <div class="act-kpi"><div class="act-kpi-num" style="color:var(--blue)">{{ active.m60 }}</div><div class="act-kpi-label">Last 60 min</div></div>
        <div class="act-kpi"><div class="act-kpi-num" style="color:var(--amber)">{{ active.h24 }}</div><div class="act-kpi-label">Last 24 hrs</div></div>
      </div>
      <div class="section-hdr"><span class="section-title">Live Users</span><div class="section-line"></div></div>
      <div class="tbl-card">
        <div class="live-card-hdr">
          <span>Presence Heartbeats</span>
          <span class="badge badge-green">● {{ active.now }} online</span>
        </div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th></th><th>Session ID</th><th>Device</th><th>Institution</th><th>Ward</th><th>Module</th><th>Last Seen</th></tr></thead>
            <tbody>
              <tr v-if="!liveRows.length"><td colspan="7"><div class="empty-state"><div class="empty-state-icon">📡</div>No active presence data</div></td></tr>
              <tr v-for="p in liveRows" :key="p.id">
                <td><div class="live-dot-sm" :style="{background: p.isLive ? 'var(--green)' : 'var(--amber)', animation: p.isLive ? '' : 'none'}"></div></td>
                <td style="color:var(--teal);font-size:10px">{{ (p.sessionId || p.userId || '—').slice(0,14) }}</td>
                <td>{{ deviceIcon(p.deviceInfo) }} {{ deviceLabel(p.deviceInfo) }}</td>
                <td>{{ p.institution || '—' }}</td>
                <td>{{ p.ward || '—' }}</td>
                <td><span class="badge badge-teal">{{ p.activeModule || '—' }}</span></td>
                <td :style="{color: p.isLive ? 'var(--green)' : 'var(--text-dim)'}">{{ ago(p.lastSeen) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
};
