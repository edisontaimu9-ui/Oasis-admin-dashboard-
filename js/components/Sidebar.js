import { store, switchTab, homeStats } from '../state.js';
import { errorLog } from '../errorLog.js';
import { lib } from '../library.js';
import { fooddb } from '../fooddb.js';

export default {
  name: 'Sidebar',
  computed: {
    store() { return store; },
    badges() {
      const h = homeStats();
      const errCount = errorLog.entries.filter(e => e.level === 'error').length;
      const pendingLib = lib.resources.filter(r => r.status === 'pending').length;
      const pendingFdb = fooddb.docs.filter(d => !d.verified).length;
      return {
        sessions: store.allSessions.length || '—',
        online:   h.nowOnline || '—',
        feedback: store.allFeedback.length || '—',
        users:    store.allUsers.length || '—',
        errors:   errCount || '—',
        library:  pendingLib || '—',
        fooddb:   pendingFdb || '—',
      };
    },
  },
  methods: { go(tab) { switchTab(tab); } },
  template: `
    <nav class="sidebar">
      <div class="nav-group-label">Main</div>
      <div class="nav-item" :class="{active: store.currentTab==='home'}" @click="go('home')"><span class="nav-icon">🏠</span><span class="nav-label">Home</span></div>
      <div class="nav-item" :class="{active: store.currentTab==='overview'}" @click="go('overview')"><span class="nav-icon">📊</span><span class="nav-label">Overview</span></div>
      <div class="nav-item" :class="{active: store.currentTab==='analytics'}" @click="go('analytics')"><span class="nav-icon">📈</span><span class="nav-label">Analytics</span></div>
      <div class="nav-sep"></div>
      <div class="nav-group-label">Data</div>
      <div class="nav-item" :class="{active: store.currentTab==='sessions'}" @click="go('sessions')"><span class="nav-icon">📋</span><span class="nav-label">Sessions</span><span class="nav-badge">{{ badges.sessions }}</span></div>
      <div class="nav-item" :class="{active: store.currentTab==='online'}" @click="go('online')"><span class="nav-icon">👤</span><span class="nav-label">Online</span><span class="nav-badge">{{ badges.online }}</span></div>
      <div class="nav-item" :class="{active: store.currentTab==='feedback'}" @click="go('feedback')"><span class="nav-icon">💬</span><span class="nav-label">Feedback</span><span class="nav-badge">{{ badges.feedback }}</span></div>
      <div class="nav-sep"></div>
      <div class="nav-group-label">System</div>
      <div class="nav-item" :class="{active: store.currentTab==='users'}" @click="go('users')"><span class="nav-icon">👥</span><span class="nav-label">Users</span><span class="nav-badge">{{ badges.users }}</span></div>
      <div class="nav-item" :class="{active: store.currentTab==='errors'}" @click="go('errors')"><span class="nav-icon">🔴</span><span class="nav-label">Error Log</span><span class="nav-badge">{{ badges.errors }}</span></div>
      <div class="nav-item" :class="{active: store.currentTab==='offline'}" @click="go('offline')"><span class="nav-icon">📶</span><span class="nav-label">Offline</span></div>
      <div class="nav-sep"></div>
      <div class="nav-group-label">Content</div>
      <div class="nav-item" :class="{active: store.currentTab==='library'}" @click="go('library')"><span class="nav-icon">📚</span><span class="nav-label">Library</span><span class="nav-badge">{{ badges.library }}</span></div>
      <div class="nav-item" :class="{active: store.currentTab==='fooddb'}" @click="go('fooddb')"><span class="nav-icon">🍱</span><span class="nav-label">Food DB</span><span class="nav-badge">{{ badges.fooddb }}</span></div>
      <div class="nav-sep"></div>
      <div class="nav-item" :class="{active: store.currentTab==='settings'}" @click="go('settings')"><span class="nav-icon">⚙️</span><span class="nav-label">Settings</span></div>
      <div class="sidebar-footer">
        <div class="sidebar-info">
          🔥 Firestore · {{ store.dbStatus === 'ok' ? 'Connected' : store.dbStatus === 'error' ? 'Error' : 'Connecting…' }}<br>
          🛡 Auth · Admin<br>
          📦 1.0.0 · Apr 2026
        </div>
      </div>
    </nav>
  `,
};
