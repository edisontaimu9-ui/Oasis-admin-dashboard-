import {
  lib, initLibrary, catName, reviewResource, editResource, deleteResource,
  formatFileSize, detectFileType, fileTypeIcon, uploadResource,
  addCategory, saveCategory, deleteCategory, addTag, saveTag, deleteTag,
} from '../../library.js';
import { showToast } from '../Toast.js';

const PAGE_SZ = 20;

export default {
  name: 'LibraryPanel',
  data() {
    return {
      panel: 'resources', statusFilter: 'all', catFilter: '', search: '', page: 0,
      review: null,       // { id, title, action, note }
      edit: null,         // { id, title, description, source, category, status, tags }
      newCatName: '', newCatId: '',
      editCat: null,      // { id, name }
      newTagName: '',
      editTag: null,      // { id, name }
      upload: null,       // { file, title, description, source, category, tags, progress, sizeText, status, statusType, busy }
    };
  },
  mounted() { initLibrary(); },
  computed: {
    lib() { return lib; },
    kpis() {
      const r = lib.resources;
      return {
        pending: r.filter(x => x.status === 'pending').length,
        approved: r.filter(x => x.status === 'approved').length,
        rejected: r.filter(x => x.status === 'rejected').length,
        total: r.length,
      };
    },
    catOptions() {
      const ids = new Set();
      lib.resources.forEach(r => { if (r.category) ids.add(r.category); });
      lib.categories.forEach(c => ids.add(c.id));
      return [...ids].map(id => ({ id, name: catName(id) }));
    },
    filtered() {
      const q = this.search.toLowerCase();
      return lib.resources.filter(r => {
        if (this.statusFilter !== 'all' && r.status !== this.statusFilter) return false;
        if (this.catFilter && r.category !== this.catFilter) return false;
        if (q) {
          const hay = [r.title, r.description, r.source, r.uploaderName].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    },
    totalPages() { return Math.max(1, Math.ceil(this.filtered.length / PAGE_SZ)); },
    rows() {
      const p = this.page >= this.totalPages ? 0 : this.page;
      return this.filtered.slice(p * PAGE_SZ, (p + 1) * PAGE_SZ);
    },
    catCounts() {
      const counts = {};
      lib.resources.forEach(r => { counts[r.category] = (counts[r.category] || 0) + 1; });
      return counts;
    },
    tagCounts() {
      const counts = {};
      lib.resources.forEach(r => (r.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
      return counts;
    },
  },
  methods: {
    catName,
    fmtDate(v) {
      if (!v) return '—';
      const d = v.toDate ? v.toDate() : new Date(v);
      return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    },
    setStatus(v) { this.statusFilter = v; this.page = 0; },

    /* Review (approve/reject) */
    openReview(r, action) { this.review = { id: r.id, title: r.title, action, note: r.reviewNote || '' }; },
    async confirmReview() {
      if (!this.review) return;
      try {
        await reviewResource(this.review.id, this.review.action, this.review.note);
        showToast(this.review.action === 'approve' ? '✅ Resource approved.' : '❌ Resource rejected.', 'success');
        this.review = null;
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    },

    /* Edit resource */
    openEdit(r) { this.edit = { id: r.id, title: r.title, description: r.description, source: r.source, category: r.category, status: r.status, tagsText: (r.tags || []).join(', ') }; },
    async saveEdit() {
      const e = this.edit;
      if (!e.title.trim()) { showToast('Title is required.', 'warn'); return; }
      if (!e.description.trim()) { showToast('Description is required.', 'warn'); return; }
      if (!e.source.trim()) { showToast('Source is required.', 'warn'); return; }
      try {
        await editResource(e.id, { title: e.title.trim(), description: e.description.trim(), source: e.source.trim(), category: e.category, status: e.status, tags: e.tagsText.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10) });
        showToast('✎ Resource updated.', 'success');
        this.edit = null;
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    },

    async removeResource(r) {
      if (!confirm(`Delete "${r.title}"?\nThis cannot be undone.`)) return;
      try { await deleteResource(r); showToast('🗑 Resource deleted.', 'success'); }
      catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
    },

    /* Categories */
    async addCat() {
      const name = this.newCatName.trim();
      const id = this.newCatId.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      if (!name) { showToast('Category name is required.', 'warn'); return; }
      if (!id) { showToast('Category ID is required.', 'warn'); return; }
      if (lib.categories.find(c => c.id === id)) { showToast('Category ID already exists.', 'warn'); return; }
      try { await addCategory(name, id); this.newCatName = ''; this.newCatId = ''; showToast('✅ Category added.', 'success'); }
      catch (e) { showToast('Error: ' + e.message, 'error'); }
    },
    openEditCat(c) { this.editCat = { id: c.id, name: c.name }; },
    async saveEditCat() {
      if (!this.editCat.name.trim()) { showToast('Name is required.', 'warn'); return; }
      try { await saveCategory(this.editCat.id, this.editCat.name.trim()); showToast('✅ Category updated.', 'success'); this.editCat = null; }
      catch (e) { showToast('Error: ' + e.message, 'error'); }
    },
    async removeCat(c) {
      const count = this.catCounts[c.id] || 0;
      const msg = count > 0 ? `Delete category "${c.name}"?\n${count} resource(s) use it. They will have no category.` : `Delete category "${c.name}"?`;
      if (!confirm(msg)) return;
      try { await deleteCategory(c.id); showToast('🗑 Category deleted.', 'success'); }
      catch (e) { showToast('Error: ' + e.message, 'error'); }
    },

    /* Tags */
    async addTagNew() {
      const name = this.newTagName.trim().toLowerCase();
      if (!name) { showToast('Tag name is required.', 'warn'); return; }
      if (lib.tags.find(t => t.name === name)) { showToast('Tag already exists.', 'warn'); return; }
      try { await addTag(name); this.newTagName = ''; showToast('✅ Tag added.', 'success'); }
      catch (e) { showToast('Error: ' + e.message, 'error'); }
    },
    openEditTag(t) { this.editTag = { id: t.id, name: t.name }; },
    async saveEditTag() {
      if (!this.editTag.name.trim()) { showToast('Tag name is required.', 'warn'); return; }
      try { await saveTag(this.editTag.id, this.editTag.name.trim().toLowerCase()); showToast('✅ Tag updated.', 'success'); this.editTag = null; }
      catch (e) { showToast('Error: ' + e.message, 'error'); }
    },
    async removeTag(t) {
      const count = this.tagCounts[t.name] || 0;
      const msg = count > 0 ? `Delete tag "${t.name}"?\nUsed in ${count} resource(s).` : `Delete tag "${t.name}"?`;
      if (!confirm(msg)) return;
      try { await deleteTag(t.id); showToast('🗑 Tag deleted.', 'success'); }
      catch (e) { showToast('Error: ' + e.message, 'error'); }
    },

    /* Upload */
    openUpload() { this.upload = { file: null, title: '', description: '', source: '', category: '', tags: '', progress: 0, sizeText: '', status: '', statusType: '', busy: false }; },
    closeUpload() { this.upload = null; },
    pickFile(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const u = this.upload;
      u.file = file;
      if (!u.title) { const base = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '); u.title = base.charAt(0).toUpperCase() + base.slice(1); }
    },
    fileTypeIcon(f) { return f ? fileTypeIcon(detectFileType(f)) : '📎'; },
    fileTypeLabel(f) { return f ? detectFileType(f) : ''; },
    fileSizeLabel(f) { return f ? formatFileSize(f.size) : ''; },
    async submitUpload() {
      const u = this.upload;
      if (!u.file) { showToast('Please select a file first.', 'warn'); return; }
      if (!u.title.trim()) { showToast('Title is required.', 'warn'); return; }
      if (!u.description.trim()) { showToast('Description is required.', 'warn'); return; }
      u.busy = true; u.status = '⬆️ Uploading file to Appwrite Storage…'; u.statusType = 'uploading'; u.progress = 0;
      try {
        await uploadResource(u.file, {
          title: u.title.trim(), description: u.description.trim(), source: u.source.trim(),
          category: u.category, tags: u.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10),
        }, (pct, uploaded, total) => {
          u.progress = pct;
          u.sizeText = `${formatFileSize(uploaded)} / ${formatFileSize(total)}`;
        });
        u.status = '✅ Upload complete! Resource published to library.'; u.statusType = 'success';
        showToast('✅ Resource uploaded and published.', 'success');
        setTimeout(() => { this.upload = null; }, 1500);
      } catch (e) {
        u.status = '❌ Upload failed: ' + e.message; u.statusType = 'error'; u.busy = false;
        showToast('Upload failed: ' + e.message, 'error');
      }
    },
  },
  template: `
    <div class="tab-pane active">
      <div class="content-header"><div class="page-title">Library <span>Resource Moderation · Categories · Tags</span></div></div>
      <div class="kpi-grid" style="margin-bottom:20px">
        <div class="kpi-card c-amber" data-icon="⏳"><div class="kpi-label">Pending</div><div class="kpi-val">{{ kpis.pending }}</div><div class="kpi-sub">Awaiting review</div></div>
        <div class="kpi-card c-green" data-icon="✅"><div class="kpi-label">Approved</div><div class="kpi-val">{{ kpis.approved }}</div><div class="kpi-sub">Live in app</div></div>
        <div class="kpi-card c-red"   data-icon="❌"><div class="kpi-label">Rejected</div><div class="kpi-val">{{ kpis.rejected }}</div><div class="kpi-sub">Not published</div></div>
        <div class="kpi-card c-teal"  data-icon="📚"><div class="kpi-label">Total</div><div class="kpi-val">{{ kpis.total }}</div><div class="kpi-sub">All submissions</div></div>
      </div>

      <div class="la-subnav">
        <button class="la-sntab" :class="{active: panel==='resources'}" @click="panel='resources'">📄 Resources</button>
        <button class="la-sntab" :class="{active: panel==='categories'}" @click="panel='categories'">🗂 Categories</button>
        <button class="la-sntab" :class="{active: panel==='tags'}" @click="panel='tags'">🏷 Tags</button>
      </div>

      <!-- Resources -->
      <div class="la-panel active" v-if="panel==='resources'">
        <div class="la-toolbar">
          <div class="chip-group">
            <div class="chip" :class="{active: statusFilter==='all'}" @click="setStatus('all')">All</div>
            <div class="chip" :class="{active: statusFilter==='pending'}" @click="setStatus('pending')">⏳ Pending</div>
            <div class="chip" :class="{active: statusFilter==='approved'}" @click="setStatus('approved')">✅ Approved</div>
            <div class="chip" :class="{active: statusFilter==='rejected'}" @click="setStatus('rejected')">❌ Rejected</div>
          </div>
          <select class="la-select" v-model="catFilter">
            <option value="">All Categories</option>
            <option v-for="c in catOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <input class="la-search" type="text" v-model="search" placeholder="Search title, uploader…">
          <span class="la-count-label">{{ filtered.length }} resource{{ filtered.length !== 1 ? 's' : '' }}</span>
          <button class="la-modal-btn la-btn-approve la-upload-trigger-btn" @click="openUpload">📤 Upload Resource</button>
        </div>
        <div class="urm-table-wrap">
          <table class="urm-table la-table">
            <thead><tr><th>Title / Tags</th><th>Category</th><th>Type</th><th>Uploader</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              <tr v-if="!rows.length"><td colspan="7" style="text-align:center;color:var(--text-dim);padding:28px 0">No resources match this filter.</td></tr>
              <tr v-for="r in rows" :key="r.id">
                <td>
                  <div class="la-title-cell">
                    <span class="la-res-title" :title="r.title">{{ r.title }}</span>
                    <div class="la-tag-row" v-if="r.tags && r.tags.length"><span v-for="t in r.tags.slice(0,3)" :key="t" class="la-tag">{{ t }}</span></div>
                  </div>
                </td>
                <td><span class="la-cat-chip">{{ catName(r.category) }}</span></td>
                <td><span class="la-type-chip">{{ r.fileType || '—' }}</span></td>
                <td class="la-uploader">{{ r.uploaderName || '—' }}</td>
                <td class="la-date">{{ fmtDate(r.uploadedAt) }}</td>
                <td>
                  <span v-if="r.status==='pending'" class="la-badge la-badge-pending">⏳ Pending</span>
                  <span v-else-if="r.status==='approved'" class="la-badge la-badge-approved">✅ Approved</span>
                  <span v-else-if="r.status==='rejected'" class="la-badge la-badge-rejected">❌ Rejected</span>
                </td>
                <td>
                  <div class="la-actions">
                    <button v-if="r.status!=='approved'" class="la-btn la-btn-approve" @click="openReview(r,'approve')">✓ Approve</button>
                    <button v-if="r.status!=='rejected'" class="la-btn la-btn-reject" @click="openReview(r,'reject')">✕ Reject</button>
                    <button class="la-btn la-btn-edit" @click="openEdit(r)">✎ Edit</button>
                    <button class="la-btn la-btn-delete" @click="removeResource(r)">🗑</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="la-pagination">
          <button class="la-pg-btn" :disabled="page===0" @click="page--">← Prev</button>
          <span class="la-pg-info">Page {{ page+1 }} / {{ totalPages }}</span>
          <button class="la-pg-btn" :disabled="page>=totalPages-1" @click="page++">Next →</button>
        </div>
      </div>

      <!-- Categories -->
      <div class="la-panel active" v-if="panel==='categories'">
        <div class="stg-card" style="margin-bottom:18px">
          <div class="stg-card-hdr">➕ Add Category</div>
          <div style="padding:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div style="flex:1;min-width:160px">
              <label class="dev-label" style="margin-bottom:6px;display:block">Display Name</label>
              <input class="la-search" v-model="newCatName" type="text" placeholder="e.g. Clinical Guidelines" style="width:100%">
            </div>
            <div style="flex:1;min-width:140px">
              <label class="dev-label" style="margin-bottom:6px;display:block">ID <small style="color:var(--text-dim)">(slug)</small></label>
              <input class="la-search" v-model="newCatId" type="text" placeholder="e.g. clinical_guidelines" style="width:100%">
            </div>
            <button class="la-modal-btn la-btn-approve" style="height:38px;padding:0 20px" @click="addCat">➕ Add</button>
          </div>
        </div>
        <div class="urm-table-wrap">
          <table class="urm-table la-table">
            <thead><tr><th>Name</th><th>ID</th><th>Resources</th><th>Actions</th></tr></thead>
            <tbody>
              <tr v-if="!lib.categories.length"><td colspan="4" style="text-align:center;color:var(--text-dim);padding:24px 0">No categories yet. Add one above.</td></tr>
              <tr v-for="c in lib.categories" :key="c.id">
                <td><strong>{{ c.name }}</strong></td>
                <td><code style="font-size:11px;color:var(--text-dim)">{{ c.id }}</code></td>
                <td>{{ catCounts[c.id] || 0 }}</td>
                <td><div class="la-actions"><button class="la-btn la-btn-edit" @click="openEditCat(c)">✎ Edit</button><button class="la-btn la-btn-delete" @click="removeCat(c)">🗑</button></div></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tags -->
      <div class="la-panel active" v-if="panel==='tags'">
        <div class="stg-card" style="margin-bottom:18px">
          <div class="stg-card-hdr">➕ Add Tag</div>
          <div style="padding:16px;display:flex;gap:10px;align-items:flex-end">
            <input class="la-search" v-model="newTagName" type="text" placeholder="e.g. enteral-nutrition" style="flex:1">
            <button class="la-modal-btn la-btn-approve" style="height:38px;padding:0 20px" @click="addTagNew">➕ Add</button>
          </div>
        </div>
        <div class="urm-table-wrap">
          <table class="urm-table la-table">
            <thead><tr><th>Tag</th><th>Usage</th><th>Actions</th></tr></thead>
            <tbody>
              <tr v-if="!lib.tags.length"><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px 0">No tags yet. Add one above.</td></tr>
              <tr v-for="t in lib.tags" :key="t.id">
                <td><span class="la-tag">{{ t.name }}</span></td>
                <td>{{ tagCounts[t.name] || 0 }}</td>
                <td><div class="la-actions"><button class="la-btn la-btn-edit" @click="openEditTag(t)">✎ Edit</button><button class="la-btn la-btn-delete" @click="removeTag(t)">🗑</button></div></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- MODAL: Review -->
      <div v-if="review" class="la-overlay" style="display:flex" @click.self="review=null">
        <div class="la-modal">
          <div class="la-modal-hdr"><span>{{ review.action==='approve' ? '✅ Approve Resource' : '❌ Reject Resource' }}</span><button class="urm-modal-close" @click="review=null">✕</button></div>
          <div class="la-modal-body">
            <div class="la-modal-res-name">{{ review.title }}</div>
            <label class="dev-label" style="margin:14px 0 6px;display:block">Moderation Note</label>
            <textarea class="dev-input dev-textarea" v-model="review.note" rows="4" :placeholder="review.action==='approve' ? 'Optional note for uploader…' : 'Reason for rejection (shown to uploader)…'"></textarea>
          </div>
          <div class="la-modal-footer">
            <button class="la-modal-btn la-modal-cancel" @click="review=null">Cancel</button>
            <button class="la-modal-btn" :class="review.action==='approve' ? 'la-btn-approve' : 'la-btn-reject'" @click="confirmReview">{{ review.action==='approve' ? '✅ Approve' : '❌ Reject' }}</button>
          </div>
        </div>
      </div>

      <!-- MODAL: Edit Resource -->
      <div v-if="edit" class="la-overlay" style="display:flex" @click.self="edit=null">
        <div class="la-modal la-modal-wide">
          <div class="la-modal-hdr"><span>✎ Edit Resource</span><button class="urm-modal-close" @click="edit=null">✕</button></div>
          <div class="la-modal-body">
            <div class="dev-field"><label class="dev-label">Title</label><input class="dev-input" v-model="edit.title" type="text" maxlength="200"></div>
            <div class="dev-field"><label class="dev-label">Description</label><textarea class="dev-input dev-textarea" v-model="edit.description" rows="3" maxlength="800"></textarea></div>
            <div class="dev-field"><label class="dev-label">Source / Author</label><input class="dev-input" v-model="edit.source" type="text" maxlength="200"></div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <div class="dev-field" style="flex:1;min-width:160px"><label class="dev-label">Category</label>
                <select class="dev-input" v-model="edit.category"><option value="">— Select —</option><option v-for="c in lib.categories" :key="c.id" :value="c.id">{{ c.name }}</option></select>
              </div>
              <div class="dev-field" style="flex:1;min-width:120px"><label class="dev-label">Status</label>
                <select class="dev-input" v-model="edit.status"><option value="pending">⏳ Pending</option><option value="approved">✅ Approved</option><option value="rejected">❌ Rejected</option></select>
              </div>
            </div>
            <div class="dev-field"><label class="dev-label">Tags <small style="color:var(--text-dim)">(comma-separated)</small></label><input class="dev-input" v-model="edit.tagsText" type="text"></div>
          </div>
          <div class="la-modal-footer">
            <button class="la-modal-btn la-modal-cancel" @click="edit=null">Cancel</button>
            <button class="la-modal-btn la-btn-approve" @click="saveEdit">💾 Save Changes</button>
          </div>
        </div>
      </div>

      <!-- MODAL: Upload Resource -->
      <div v-if="upload" class="la-overlay" style="display:flex" @click.self="!upload.busy && closeUpload()">
        <div class="la-modal la-modal-wide">
          <div class="la-modal-hdr"><span>📤 Upload Resource</span><button class="urm-modal-close" @click="closeUpload" :disabled="upload.busy">✕</button></div>
          <div class="la-modal-body">
            <div class="la-upload-drop-zone" :class="{'has-file': upload.file}" @click="$refs.fileInput.click()">
              <input ref="fileInput" type="file" style="display:none" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.zip,.rar,.7z,.png,.jpg,.jpeg,.gif,.svg,.webp,.mp4,.mov" @change="pickFile">
              <div class="la-upload-drop-icon">{{ upload.file ? fileTypeIcon(upload.file) : '📎' }}</div>
              <div class="la-upload-drop-label">Drop file here or <span class="la-upload-browse-link">browse</span></div>
              <div class="la-upload-drop-types">PDF · DOCX · PPTX · XLSX · ZIP · Images</div>
            </div>
            <div class="la-upload-file-card" v-if="upload.file" style="display:flex">
              <div class="la-upload-file-card-icon">{{ fileTypeIcon(upload.file) }}</div>
              <div class="la-upload-file-card-meta">
                <div class="la-upload-file-card-name">{{ upload.file.name }}</div>
                <div class="la-upload-file-card-badges"><span class="la-upload-badge la-upload-badge-size">{{ fileSizeLabel(upload.file) }}</span><span class="la-upload-badge la-upload-badge-type">{{ fileTypeLabel(upload.file) }}</span></div>
              </div>
              <button class="la-upload-change-btn" @click="$refs.fileInput.click()">Change</button>
            </div>
            <div class="la-upload-progress-section" v-if="upload.busy" style="display:block">
              <div class="la-upload-progress-track"><div class="la-upload-progress-fill" :style="{width: upload.progress + '%'}"></div></div>
              <div class="la-upload-progress-meta"><span class="la-upload-progress-sizes">{{ upload.sizeText }}</span><span class="la-upload-progress-pct">{{ upload.progress }}%</span></div>
            </div>
            <div class="la-upload-status-msg" v-if="upload.status" :class="'la-upload-status--' + upload.statusType" style="display:block">{{ upload.status }}</div>
            <div v-if="upload.file">
              <div class="la-upload-form-divider"></div>
              <div class="dev-field"><label class="dev-label">Title <span style="color:var(--red)">*</span></label><input class="dev-input" v-model="upload.title" type="text" maxlength="200" placeholder="e.g. ASPEN Nutrition Guidelines 2024"></div>
              <div class="dev-field"><label class="dev-label">Description <span style="color:var(--red)">*</span></label><textarea class="dev-input dev-textarea" v-model="upload.description" rows="3" maxlength="800" placeholder="Brief description of the resource content and audience…"></textarea></div>
              <div style="display:flex;gap:12px;flex-wrap:wrap">
                <div class="dev-field" style="flex:1;min-width:160px"><label class="dev-label">Source / Author</label><input class="dev-input" v-model="upload.source" type="text" maxlength="200" placeholder="e.g. ASPEN, WHO, ESPEN, KUHeS"></div>
                <div class="dev-field" style="flex:1;min-width:140px"><label class="dev-label">Category</label>
                  <select class="dev-input" v-model="upload.category"><option value="">— No Category —</option><option v-for="c in lib.categories" :key="c.id" :value="c.id">{{ c.name }}</option></select>
                </div>
              </div>
              <div class="dev-field"><label class="dev-label">Tags <small style="color:var(--text-dim)">(comma-separated)</small></label><input class="dev-input" v-model="upload.tags" type="text" placeholder="e.g. enteral-nutrition, guidelines, paediatric"></div>
            </div>
          </div>
          <div class="la-modal-footer">
            <button class="la-modal-btn la-modal-cancel" @click="closeUpload" :disabled="upload.busy">Cancel</button>
            <button class="la-modal-btn la-btn-approve" @click="submitUpload" :disabled="upload.busy || !upload.file">{{ upload.busy ? 'Uploading…' : '📤 Upload' }}</button>
          </div>
        </div>
      </div>

      <!-- MODAL: Edit Category -->
      <div v-if="editCat" class="la-overlay" style="display:flex" @click.self="editCat=null">
        <div class="la-modal">
          <div class="la-modal-hdr"><span>✎ Edit Category</span><button class="urm-modal-close" @click="editCat=null">✕</button></div>
          <div class="la-modal-body">
            <div class="la-modal-res-name" style="color:var(--text-dim);font-size:12px;margin-bottom:14px">{{ editCat.id }}</div>
            <div class="dev-field"><label class="dev-label">Display Name</label><input class="dev-input" v-model="editCat.name" type="text"></div>
          </div>
          <div class="la-modal-footer">
            <button class="la-modal-btn la-modal-cancel" @click="editCat=null">Cancel</button>
            <button class="la-modal-btn la-btn-approve" @click="saveEditCat">💾 Save</button>
          </div>
        </div>
      </div>

      <!-- MODAL: Edit Tag -->
      <div v-if="editTag" class="la-overlay" style="display:flex" @click.self="editTag=null">
        <div class="la-modal">
          <div class="la-modal-hdr"><span>✎ Edit Tag</span><button class="urm-modal-close" @click="editTag=null">✕</button></div>
          <div class="la-modal-body"><div class="dev-field"><label class="dev-label">Tag Name</label><input class="dev-input" v-model="editTag.name" type="text"></div></div>
          <div class="la-modal-footer">
            <button class="la-modal-btn la-modal-cancel" @click="editTag=null">Cancel</button>
            <button class="la-modal-btn la-btn-approve" @click="saveEditTag">💾 Save</button>
          </div>
        </div>
      </div>
    </div>
  `,
};
