import { store } from '../../state.js';
import { ts, makeChart, destroyChart, CHART_COLORS, CHART_DEFAULTS } from '../../utils.js';

export default {
  name: 'OverviewPanel',
  computed: {
    store() { return store; },
    // reference-changing "signals" the watchers key off (state.js reassigns
    // these arrays wholesale on every Firestore snapshot)
    sessionsSig() { return store.allSessions; },
    calcsSig() { return store.allCalculations; },
    usersSig() { return store.allUsers; },

    kpis() {
      const s = store.allSessions;
      const today = s.filter(x => x.date === new Date().toISOString().slice(0, 10)).length;
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const week = s.filter(x => ts(x) >= weekAgo).length;
      const uniquePt = new Set(s.map(x => x.userId || x.sessionId)).size;
      const institutions = new Set(s.map(x => x.institution).filter(Boolean)).size;

      let topMod = '—', topCount = 0;
      for (const [k, v] of Object.entries(store.globalStats)) {
        if (k.startsWith('module_') && v > topCount) { topCount = v; topMod = k.replace('module_', ''); }
      }
      return {
        total: s.length, today, week, uniquePt, institutions,
        topMod: topMod === '—' ? '—' : topMod.charAt(0).toUpperCase() + topMod.slice(1),
        topCount,
      };
    },
  },
  watch: {
    sessionsSig() { this.renderCharts(); },
    calcsSig() { this.renderCharts(); },
    usersSig() { this.renderCharts(); },
  },
  mounted() { this.renderCharts(); },
  beforeUnmount() { this.destroyCharts(); },
  methods: {
    renderCharts() {
      this.chartSessionsTrend();
      this.chartCalcTypes();
      this.chartInstitutions();
      this.chartRoles();
    },
    destroyCharts() {
      ['sessionsTrend', 'calcTypes', 'institutions', 'roles'].forEach(k => destroyChart(this.$refs[k]));
    },
    chartSessionsTrend() {
      const labels = [], counts = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
        const n = new Date(d); n.setDate(n.getDate() + 1);
        labels.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
        counts.push(store.allSessions.filter(s => { const t = ts(s); return t >= d && t < n; }).length);
      }
      makeChart(this.$refs.sessionsTrend, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Sessions', data: counts, borderColor: '#1de9d4', backgroundColor: 'rgba(29,233,212,0.06)', pointBackgroundColor: '#1de9d4', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3 }] },
        options: { ...CHART_DEFAULTS, scales: { x: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 8 } } }, y: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 9 } }, beginAtZero: true } } },
      });
    },
    chartCalcTypes() {
      const counts = {};
      store.allCalculations.forEach(c => { const t = c.module || c.calcType || 'adult'; counts[t] = (counts[t] || 0) + 1; });
      const labels = Object.keys(counts), data = Object.values(counts);
      if (!labels.length) { destroyChart(this.$refs.calcTypes); return; }
      makeChart(this.$refs.calcTypes, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS.map(c => c + '30'), borderColor: CHART_COLORS, borderWidth: 2, hoverBackgroundColor: CHART_COLORS.map(c => c + '55') }] },
        options: { ...CHART_DEFAULTS, cutout: '62%' },
      });
    },
    chartInstitutions() {
      const counts = {};
      store.allSessions.forEach(s => { const h = s.institution || 'Unknown'; counts[h] = (counts[h] || 0) + 1; });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (!sorted.length) { destroyChart(this.$refs.institutions); return; }
      makeChart(this.$refs.institutions, {
        type: 'bar',
        data: { labels: sorted.map(([k]) => k.length > 20 ? k.slice(0, 18) + '…' : k), datasets: [{ label: 'Sessions', data: sorted.map(([, v]) => v), backgroundColor: CHART_COLORS.map(c => c + '30'), borderColor: CHART_COLORS, borderWidth: 2, borderRadius: 4 }] },
        options: { ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }, scales: { x: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 7 }, maxRotation: 30 } }, y: { grid: { color: 'rgba(30,48,80,0.5)' }, ticks: { color: '#3d5070', font: { family: 'JetBrains Mono', size: 9 } }, beginAtZero: true } } },
      });
    },
    chartRoles() {
      const counts = {};
      store.allUsers.forEach(u => { const r = u.userRole || 'Unknown'; counts[r] = (counts[r] || 0) + 1; });
      const labels = Object.keys(counts), data = Object.values(counts);
      if (!labels.length) { destroyChart(this.$refs.roles); return; }
      makeChart(this.$refs.roles, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS.map(c => c + '30'), borderColor: CHART_COLORS, borderWidth: 2 }] },
        options: { ...CHART_DEFAULTS, cutout: '55%' },
      });
    },
  },
  template: `
    <div class="tab-pane active">
      <div class="content-header"><div class="page-title">Overview <span>Platform summary</span></div></div>
      <div class="section-hdr"><span class="section-title">Key Performance Indicators</span><div class="section-line"></div></div>
      <div class="kpi-grid">
        <div class="kpi-card c-teal"   data-icon="📋"><div class="kpi-label">Total Sessions</div><div class="kpi-val">{{ kpis.total }}</div><div class="kpi-sub">All time</div></div>
        <div class="kpi-card c-blue"   data-icon="📅"><div class="kpi-label">Sessions Today</div><div class="kpi-val">{{ kpis.today }}</div><div class="kpi-sub">Since 00:00</div></div>
        <div class="kpi-card c-green"  data-icon="📆"><div class="kpi-label">This Week</div><div class="kpi-val">{{ kpis.week }}</div><div class="kpi-sub">Mon – today</div></div>
        <div class="kpi-card c-amber"  data-icon="👤"><div class="kpi-label">Unique Patients</div><div class="kpi-val">{{ kpis.uniquePt }}</div><div class="kpi-sub">Distinct users</div></div>
        <div class="kpi-card c-purple" data-icon="🏥"><div class="kpi-label">Institutions</div><div class="kpi-val">{{ kpis.institutions }}</div><div class="kpi-sub">Active sites</div></div>
        <div class="kpi-card c-red"    data-icon="⚗️"><div class="kpi-label">Top Calc Type</div><div class="kpi-val" style="font-size:16px;margin-top:4px">{{ kpis.topMod }}</div><div class="kpi-sub">{{ kpis.topCount }} calculations</div></div>
      </div>
      <div class="section-hdr"><span class="section-title">Charts</span><div class="section-line"></div></div>
      <div class="charts-grid">
        <div class="chart-card"><div class="chart-card-title">📈 Session Trend (14 days)</div><div class="chart-wrap"><canvas ref="sessionsTrend"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title">🍩 Calculation Types</div><div class="chart-wrap"><canvas ref="calcTypes"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title">🏥 Sessions by Institution</div><div class="chart-wrap"><canvas ref="institutions"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title">👥 User Roles</div><div class="chart-wrap"><canvas ref="roles"></canvas></div></div>
      </div>
    </div>
  `,
};
