import { store, deleteSession, deleteSessionsBulk } from '../../state.js';
import { showToast } from '../Toast.js';
import { fmtTs, downloadCSV, TODAY } from '../../utils.js';

const MODULE_BADGE = { adult: 'blue', pedi: 'purple', 'low-resource': 'teal', blenderized: 'teal', tpn: 'amber', enteral: 'green', oncology: 'red', critical: 'red', maternal: 'green', renal: 'blue' };

export default {
  name: 'SessionsPanel',
  data() { return { search: '' }; },
  computed: {
    store() { return store; },
    filtered() {
      const q = this.search.toLowerCase();
      if (!q) return store.allSessions;
      return store.allSessions.filter(s =>
        (s.sessionId || '').toLowerCase().includes(q) ||
        (s.institution || '').toLowerCase().includes(q) ||
        (s.lastModule || '').toLowerCase().includes(q) ||
        (s.ward || '').toLowerCase().includes(q) ||
        (s.userName || '').toLowerCase().includes(q)
      );
    },
    rows() { return this.filtered.slice(0, 200); },
  },
  methods: {
    fmtTs,
    badgeClass(m) { return 'badge-' + (MODULE_BADGE[m] || 'dim'); },
    async removeOne(id) {
      if (!confirm('Delete this session record? This cannot be undone.')) return;
      try { await deleteSession(id); showToast('Session deleted.', 'success'); }
      catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
    },
    async removeAll() {
      const targets = this.filtered;
      if (!targets.length) return;
      const label = this.search ? `${targets.length} filtered session(s)` : `ALL ${targets.length} session(s)`;
      if (!confirm(`Permanently delete ${label}? This cannot be undone.`)) return;
      showToast(`Deleting ${targets.length} session(s)…`, 'info');
      const { ok, fail } = await deleteSessionsBulk(targets);
      showToast(`Deleted ${ok} session(s)${fail ? ` · ${fail} failed` : ''}.`, fail ? 'error' : 'success');
    },
    exportCSV() {
      const headers = ['Session ID', 'Date', 'Institution', 'Ward', 'Last Module', 'Calc Count', 'Status', 'User Name', 'User Role'];
      const rows = store.allSessions.map(s => [
        s.sessionId || '', fmtTs(s.startedAt), s.institution || '', s.ward || '',
        s.lastModule || '', s.calcCount || 0, s.status || '', s.userName || '', s.userRole || '',
      ]);
      downloadCSV('nutritrack_sessions_' + TODAY + '.csv', headers, rows);
      showToast('Sessions CSV exported ✓', 'success');
    },
  },
  template: `
    <div class="tab-pane active">
      <div class="content-header">
        <div class="page-title">Sessions <span>{{ store.allSessions.length }} records</span></div>
        <button class="btn btn-teal" @click="exportCSV">⬇ Export CSV</button>
      </div>
      <div class="toolbar">
        <input type="text" class="search-inp" v-model="search" placeholder="Search Patient ID, Ward, Institution, Calc Type…">
        <button class="btn" style="background:rgba(220,53,69,.15);color:#ff6b6b;border:1px solid rgba(220,53,69,.35);margin-left:auto" @click="removeAll">🗑 Delete All</button>
      </div>
      <div class="tbl-card">
        <div class="live-card-hdr">
          <span>Session Records</span>
          <span class="badge badge-teal">{{ filtered.length }} total</span>
        </div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Date &amp; Time</th><th>Session ID</th><th>Ward</th><th>Institution</th><th>Last Module</th><th>Calcs</th><th>Status</th><th>User</th><th style="text-align:center">Del</th></tr></thead>
            <tbody>
              <tr v-if="!rows.length"><td colspan="9"><div class="empty-state"><div class="empty-state-icon">🔍</div>No sessions match your search</div></td></tr>
              <tr v-for="s in rows" :key="s.id">
                <td style="white-space:nowrap">{{ fmtTs(s.startedAt) }}</td>
                <td style="color:var(--teal);font-size:10px">{{ (s.sessionId||'—').slice(0,16) }}</td>
                <td>{{ s.ward || '—' }}</td>
                <td>{{ s.institution || '—' }}</td>
                <td><span v-if="s.lastModule" :class="'badge ' + badgeClass(s.lastModule)">{{ s.lastModule }}</span><span v-else>—</span></td>
                <td style="text-align:center">{{ s.calcCount || 0 }}</td>
                <td>
                  <span v-if="s.status==='active'" class="badge badge-green">Active</span>
                  <span v-else-if="s.status==='ended'" class="badge badge-dim">Ended</span>
                  <span v-else class="badge badge-amber">Unknown</span>
                </td>
                <td style="font-size:10px;color:var(--text-dim)">{{ s.userName || '—' }}</td>
                <td style="text-align:center"><button @click="removeOne(s.id)" title="Delete session" style="background:none;border:none;cursor:pointer;font-size:15px;opacity:.7;padding:2px 6px">🗑</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
};
