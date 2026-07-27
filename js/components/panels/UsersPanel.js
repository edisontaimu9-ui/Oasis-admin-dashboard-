import { store, userRoleOverrides, saveUserRole } from '../../state.js';
import { showToast } from '../Toast.js';
import { ago } from '../../utils.js';

const ROLES = ['Dietitian', 'Clinician', 'Nurse', 'Student', 'Researcher', 'Other'];
const ROLE_COLORS = { Dietitian: 'var(--teal)', Clinician: 'var(--blue)', Nurse: 'var(--green)', Student: 'var(--amber)', Researcher: 'var(--purple)', Other: 'var(--text-muted)', Unknown: 'var(--text-muted)' };
const ROLE_ICON = { Dietitian: '🥗', Clinician: '🩺', Nurse: '💊', Student: '🎓', Researcher: '🔬', Other: '👤' };

export default {
  name: 'UsersPanel',
  data() { return { search: '', roleFilter: 'all', modalUser: null, modalRole: '' }; },
  computed: {
    store() { return store; },
    ROLES() { return ROLES; },
    rows() {
      return store.allUsers.map(u => {
        const sessions = store.allSessions.filter(s => s.userId === u.id);
        const lastSession = sessions.reduce((latest, s) => {
          const t = s.startedAt?.toDate ? s.startedAt.toDate().getTime() : 0;
          return t > latest ? t : latest;
        }, 0);
        return {
          id: u.id,
          userName: u.userName || '—',
          institution: sessions[0]?.institution || '—',
          role: userRoleOverrides[u.id] || u.userRole || 'Unknown',
          sessions: sessions.length,
          lastActive: lastSession ? ago(new Date(lastSession)) : '—',
        };
      });
    },
    filtered() {
      const q = this.search.toLowerCase();
      return this.rows.filter(u => {
        if (this.roleFilter !== 'all' && u.role !== this.roleFilter) return false;
        if (!q) return true;
        return u.id.toLowerCase().includes(q) || u.userName.toLowerCase().includes(q) || u.institution.toLowerCase().includes(q);
      });
    },
  },
  methods: {
    roleColor(r) { return ROLE_COLORS[r] || 'var(--text-muted)'; },
    icon(r) { return ROLE_ICON[r] || '👤'; },
    openModal(u) { this.modalUser = u; this.modalRole = u.role; },
    closeModal() { this.modalUser = null; },
    async save() {
      if (!this.modalUser || !this.modalRole) { showToast('Select a role first', 'warn'); return; }
      const { persisted } = await saveUserRole(this.modalUser.id, this.modalRole);
      showToast(persisted ? 'Role updated in Firestore ✓' : 'Role updated (offline mode)', persisted ? 'success' : 'info');
      this.closeModal();
    },
  },
  template: `
    <div class="tab-pane active">
      <div class="content-header"><div class="page-title">Users <span>Role management</span></div></div>
      <div class="urm-filter-bar">
        <input class="urm-search" v-model="search" placeholder="🔍  Search by name, ID or institution…">
        <div class="chip-group">
          <div class="chip" :class="{active: roleFilter==='all'}" @click="roleFilter='all'">All</div>
          <div v-for="r in ROLES" :key="r" class="chip" :class="{active: roleFilter===r}" @click="roleFilter=r">{{ r }}</div>
        </div>
        <span class="urm-count-label">{{ filtered.length }} account{{ filtered.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="urm-table-wrap">
        <table class="urm-table">
          <thead><tr><th>User ID</th><th>Name</th><th>Institution</th><th>Role</th><th>Sessions</th><th>Last Active</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-if="!filtered.length"><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No accounts match</td></tr>
            <tr v-for="u in filtered" :key="u.id">
              <td style="font-family:var(--mono);font-size:10px;color:var(--teal)">{{ u.id.slice(0,16) }}</td>
              <td>{{ u.userName }}</td>
              <td>{{ u.institution }}</td>
              <td><span :style="{color: roleColor(u.role), fontWeight:600, fontSize:'11px'}">{{ u.role }}</span></td>
              <td style="text-align:center">{{ u.sessions }}</td>
              <td style="font-family:var(--mono);font-size:10px;color:var(--text-dim)">{{ u.lastActive }}</td>
              <td><button class="urm-edit-btn" @click="openModal(u)">✏ Edit Role</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="modalUser" class="urm-modal-overlay" style="display:flex" @click.self="closeModal">
        <div class="urm-modal">
          <div class="urm-modal-hdr"><span>Edit User Role</span><button class="urm-modal-close" @click="closeModal">✕</button></div>
          <div class="urm-modal-body">
            <div class="urm-modal-uid">{{ modalUser.id }}</div>
            <div class="urm-modal-name">{{ modalUser.userName }}</div>
            <div class="urm-modal-lbl">Assign Role</div>
            <div class="chip-group" style="flex-wrap:wrap;gap:8px;margin-bottom:18px">
              <div v-for="r in ROLES" :key="r" class="chip" :class="{active: modalRole===r}" @click="modalRole=r">{{ icon(r) }} {{ r }}</div>
            </div>
            <button class="urm-save-btn" @click="save">💾 Save Role</button>
          </div>
        </div>
      </div>
    </div>
  `,
};
