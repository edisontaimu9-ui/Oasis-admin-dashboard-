import { errorLog, clearErrorLog } from '../../errorLog.js';
import { showToast } from '../Toast.js';

const ICONS = { error: '🔴', warn: '🟡', info: '🔵' };
const COLORS = { error: 'var(--red)', warn: 'var(--amber)', info: 'var(--blue)' };

export default {
  name: 'ErrorLogPanel',
  data() { return { filter: 'all' }; },
  computed: {
    errorLog() { return errorLog; },
    filtered() {
      return this.filter === 'all' ? errorLog.entries : errorLog.entries.filter(e => e.level === this.filter);
    },
  },
  methods: {
    icon(l) { return ICONS[l] || '⚪'; },
    color(l) { return COLORS[l] || 'inherit'; },
    fmtEntry(ts) {
      const t = new Date(ts);
      return t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
             t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },
    clear() {
      if (!confirm('Clear all ' + errorLog.entries.length + ' log entries?')) return;
      clearErrorLog();
      showToast('Error log cleared', 'info');
    },
  },
  template: `
    <div class="tab-pane active">
      <div class="content-header"><div class="page-title">Error Log <span>Crash &amp; runtime errors</span></div></div>
      <div class="err-toolbar">
        <div class="chip-group">
          <div class="chip" :class="{active: filter==='all'}" @click="filter='all'">All</div>
          <div class="chip" :class="{active: filter==='error'}" @click="filter='error'">🔴 Error</div>
          <div class="chip" :class="{active: filter==='warn'}" @click="filter='warn'">🟡 Warning</div>
          <div class="chip" :class="{active: filter==='info'}" @click="filter='info'">🔵 Info</div>
        </div>
        <button class="err-clear-btn" @click="clear">🗑 Clear Log</button>
        <span class="err-count-label">{{ filtered.length }} entr{{ filtered.length === 1 ? 'y' : 'ies' }}</span>
      </div>
      <div class="err-log-wrap">
        <div class="err-empty" v-if="!filtered.length">No errors recorded this session.</div>
        <div v-for="(entry, i) in filtered" :key="i" :class="'err-entry err-' + entry.level">
          <div class="err-meta">
            <span class="err-icon">{{ icon(entry.level) }}</span>
            <span class="err-level-badge" :style="{color: color(entry.level)}">{{ entry.level.toUpperCase() }}</span>
            <span class="err-source">{{ entry.source }}</span>
            <span class="err-time">{{ fmtEntry(entry.ts) }}</span>
          </div>
          <div class="err-msg">{{ entry.msg }}</div>
        </div>
      </div>
    </div>
  `,
};
