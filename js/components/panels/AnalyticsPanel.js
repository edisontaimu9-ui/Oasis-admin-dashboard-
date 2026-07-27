import { store } from '../../state.js';
import { ts, makeChart, destroyChart, presenceCounts, liveUserRows, deviceIcon, deviceLabel, ago, CHART_DEFAULTS } from '../../utils.js';

export default {
  name: 'AnalyticsPanel',
  computed: {
    store() { return store; },
    sessionsSig() { return store.allSessions; },
    calcsSig() { return store.allCalculations; },
    presenceSig() { return store.allPresence; },

    active() { return presenceCounts(store.allPresence); },
    liveRows() { return liveUserRows(store.allPresence); },
  },
  watch: {
    sessionsSig() { this.renderCharts(); },
    calcsSig() { this.renderCharts(); },
    presenceSig() { this.renderCharts(); },
  },
  mounted() { this.renderCharts(); },
  beforeUnmount() { this.destroyCharts(); },
  methods: {
    deviceIcon, deviceLabel, ago,
    renderCharts() {
      this.chartHourly();
      this.chartDevices();
      this.chartDiagnoses();
      this.chartHospitalUsage();
    },
    destroyCharts() {
      ['hourly', 'devices', 'diagnoses', 'hospitalUsage'].forEach(k => destroyChart(this.$refs[k]));
    },
    chartHourly() {
      const now = Date.now();
      const labels = [], counts = [];
      for (let i = 11; i >= 0; i--) {
        const start = new Date(now - i * 3600000); start.setMinutes(0, 0, 0);
        const end = new Date(start.getTime() + 3600000);
        labels.push(start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
        const count = store.allPresence.length
          ? store.allPresence.filter(p => { const t = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0; return t >= start.getTime() && t < end.getTime(); }).length
          : store.allSessions.filter(s => { const t = ts(s).getTime(); return t >= start.getTime() && t < end.getTime(); }).length;
        counts.push(count);
      }
      makeChart(this.$refs.hourly, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Activity', data: counts, backgroundColor: counts.map((_, i) => i === 11 ? 'rgba(52,211,153,0.6)' : 'rgba(29,233,212,0.12)'), borderColor: counts.map((_, i) => i === 11 ? '#34d399' : '#1de9d4'), borderWidth: 1, borderRadius: 4 }] },
        options: { ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }, scales: { x: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 8 } } }, y: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 9 } }, beginAtZero: true, stepSize: 1 } } },
      });
    },
    chartDevices() {
      const counts = { Mobile: 0, Desktop: 0, Tablet: 0, Unknown: 0 };
      [...store.allSessions, ...store.allPresence].forEach(s => {
        const ua = (s.userAgent || s.deviceInfo || '').toLowerCase();
        if (/ipad|tablet/.test(ua)) counts.Tablet++;
        else if (/mobile|android|iphone/.test(ua)) counts.Mobile++;
        else if (ua) counts.Desktop++;
        else counts.Unknown++;
      });
      const labels = Object.keys(counts).filter(k => counts[k] > 0);
      const data = labels.map(k => counts[k]);
      if (!data.length) { destroyChart(this.$refs.devices); return; }
      makeChart(this.$refs.devices, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: ['rgba(96,165,250,0.3)', 'rgba(29,233,212,0.3)', 'rgba(167,139,250,0.3)', 'rgba(100,130,160,0.3)'], borderColor: ['#60a5fa', '#1de9d4', '#a78bfa', '#3d5070'], borderWidth: 2 }] },
        options: { ...CHART_DEFAULTS, cutout: '60%' },
      });
    },
    chartDiagnoses() {
      const counts = {};
      store.allCalculations.forEach(c => { if (c.diagnosis) counts[c.diagnosis] = (counts[c.diagnosis] || 0) + 1; });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (!sorted.length) { destroyChart(this.$refs.diagnoses); return; }
      makeChart(this.$refs.diagnoses, {
        type: 'bar',
        data: { labels: sorted.map(([k]) => k.length > 22 ? k.slice(0, 20) + '…' : k), datasets: [{ label: 'Calcs', data: sorted.map(([, v]) => v), backgroundColor: 'rgba(240,180,41,0.15)', borderColor: '#f0b429', borderWidth: 2, borderRadius: 4 }] },
        options: { ...CHART_DEFAULTS, indexAxis: 'y', plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }, scales: { x: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 9 } }, beginAtZero: true }, y: { grid: { color: 'rgba(30,48,80,0.3)' }, ticks: { color: '#6b82a0', font: { family: 'JetBrains Mono', size: 8 } } } } },
      });
    },
    chartHospitalUsage() {
      const counts = {};
      store.allSessions.forEach(s => { const h = s.institution || 'Unknown'; counts[h] = (counts[h] || 0) + 1; });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (!sorted.length) { destroyChart(this.$refs.hospitalUsage); return; }
      makeChart(this.$refs.hospitalUsage, {
        type: 'bar',
        data: { labels: sorted.map(([k]) => k.length > 22 ? k.slice(0, 20) + '…' : k), datasets: [{ label: 'Sessions', data: sorted.map(([, v]) => v), backgroundColor: 'rgba(96,165,250,0.15)', borderColor: '#60a5fa', borderWidth: 2, borderRadius: 4 }] },
        options: { ...CHART_DEFAULTS, indexAxis: 'y', plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }, scales: { x: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 9 } }, beginAtZero: true }, y: { grid: { color: 'rgba(30,48,80,0.3)' }, ticks: { color: '#6b82a0', font: { family: 'JetBrains Mono', size: 8 } } } } },
      });
    },
  },
  template: `
    <div class="tab-pane active">
      <div class="content-header"><div class="page-title">Analytics <span>Real-time · Activity · Devices</span></div></div>
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
              <tr v-if="!liveRows.length"><td colspan="7"><div class="empty-state"><div class="empty-state-icon">🟢</div>No active users right now</div></td></tr>
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
      <div class="section-hdr"><span class="section-title">Charts</span><div class="section-line"></div></div>
      <div class="charts-grid">
        <div class="chart-card"><div class="chart-card-title">📊 Hourly Activity (last 12h)</div><div class="chart-wrap"><canvas ref="hourly"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title">📱 Device Distribution</div><div class="chart-wrap"><canvas ref="devices"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title">🩺 Diagnosis Breakdown</div><div class="chart-wrap"><canvas ref="diagnoses"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title">🏥 Hospital Usage</div><div class="chart-wrap"><canvas ref="hospitalUsage"></canvas></div></div>
      </div>
    </div>
  `,
};
