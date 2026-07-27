import { fooddb, initFoodDB, verifyEntry, rejectEntry, deleteEntry, validateEntry, saveEntry, lookupBarcode } from '../../fooddb.js';
import { showToast } from '../Toast.js';

const PAGE_SIZE = 25;
const FLAG = { MW: '🇲🇼', ZA: '🇿🇦', TZ: '🇹🇿', ZM: '🇿🇲', KE: '🇰🇪', MZ: '🇲🇿', ZW: '🇿🇼' };
const CATEGORIES = ['Staples', 'Legumes', 'Protein Foods', 'Vegetables', 'Fruits', 'Dairy', 'Fats & Oils', 'Beverages', 'Condiments', 'Snacks', 'Infant Formula', 'ENF', 'Packaged'];
const COUNTRIES = [['MW', '🇲🇼 Malawi'], ['ZA', '🇿🇦 South Africa'], ['TZ', '🇹🇿 Tanzania'], ['ZM', '🇿🇲 Zambia'], ['KE', '🇰🇪 Kenya'], ['MZ', '🇲🇿 Mozambique'], ['ZW', '🇿🇼 Zimbabwe']];

function blankForm() {
  return { name: '', brand: '', barcode: '', category: 'Protein Foods', country: 'MW', kcal: '', kj: '', pro: '', cho: '', fat: '', fiber: '', sugar: '', sodium: '', servingSize: '', servingLabel: '', image: '', verified: false };
}
function formFromDoc(d) {
  const n = d.per100g || {};
  return { name: d.name || '', brand: d.brand || '', barcode: d.barcode || '', category: d.category || 'Packaged', country: d.country || 'MW', kcal: n.kcal ?? '', kj: n.kj ?? '', pro: n.pro ?? '', cho: n.cho ?? '', fat: n.fat ?? '', fiber: n.fiber ?? '', sugar: n.sugar ?? '', sodium: n.sodium ?? '', servingSize: d.servingSize ?? '', servingLabel: d.servingLabel || '', image: d.image || '', verified: !!d.verified };
}
function readForm(f) {
  if (!f.name.trim()) return null;
  const num = v => (v !== '' && v != null) ? +v : null;
  let kcal = num(f.kcal), kj = num(f.kj);
  if (kj == null && kcal != null) kj = +(kcal * 4.184).toFixed(0);
  return {
    name: f.name.trim(), nameLower: f.name.trim().toLowerCase(), brand: f.brand.trim() || null,
    barcode: f.barcode.replace(/\D/g, '') || null, category: f.category || 'Packaged', country: f.country || 'MW',
    per100g: { kcal, kj, pro: num(f.pro), cho: num(f.cho), fat: num(f.fat), fiber: num(f.fiber), sugar: num(f.sugar), sodium: num(f.sodium) },
    servingSize: num(f.servingSize), servingLabel: f.servingLabel.trim() || null, image: f.image.trim() || null, verified: !!f.verified,
  };
}

export default {
  name: 'FoodDBPanel',
  data() {
    return {
      panel: 'submissions', subSearch: '', subPage: 0, search: '', catFilter: '', countryFilter: '', verifiedFilter: 'all', page: 0,
      editDoc: null, editId: null, formErr: '', saving: false,
      delTarget: null, importBarcode: '', importLog: '', looking: false,
    };
  },
  mounted() { if (!fooddb.loaded) initFoodDB().catch(e => showToast('⚠ Could not load packaged foods: ' + e.message, 'error')); },
  computed: {
    fooddb() { return fooddb; },
    CATEGORIES() { return CATEGORIES; },
    COUNTRIES() { return COUNTRIES; },
    kpis() {
      const docs = fooddb.docs;
      return {
        total: docs.length, pending: docs.filter(d => !d.verified).length,
        verified: docs.filter(d => d.verified).length,
        countries: new Set(docs.map(d => d.country).filter(Boolean)).size,
      };
    },
    subFiltered() {
      const q = this.subSearch.toLowerCase();
      return fooddb.docs.filter(d => !d.verified).filter(d => !q ||
        (d.name || '').toLowerCase().includes(q) || (d.brand || '').toLowerCase().includes(q) ||
        (d.submittedBy || '').toLowerCase().includes(q) || (d.barcode || '').includes(q));
    },
    subTotalPages() { return Math.max(1, Math.ceil(this.subFiltered.length / PAGE_SIZE)); },
    subRows() { const p = this.subPage >= this.subTotalPages ? 0 : this.subPage; return this.subFiltered.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE); },

    filtered() {
      const q = this.search.toLowerCase();
      const rows = fooddb.docs.filter(d => {
        if (this.catFilter && d.category !== this.catFilter) return false;
        if (this.countryFilter && d.country !== this.countryFilter) return false;
        if (this.verifiedFilter === 'true' && !d.verified) return false;
        if (this.verifiedFilter === 'false' && d.verified) return false;
        if (q) { const n = (d.name || '').toLowerCase(), b = (d.brand || '').toLowerCase(), c = d.barcode || ''; if (!n.includes(q) && !b.includes(q) && !c.includes(q)) return false; }
        return true;
      });
      return rows.slice().sort((a, b) => (a.nameLower || '').localeCompare(b.nameLower || ''));
    },
    totalPages() { return Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE)); },
    rows() { const p = this.page >= this.totalPages ? 0 : this.page; return this.filtered.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE); },
  },
  methods: {
    flag(c) { return FLAG[c] || c || '—'; },
    macro(v) { return (v != null && v !== '') ? (+v).toFixed(1) : '—'; },

    async approve(id, name) {
      try { await verifyEntry(id); showToast('✅ Approved & published: ' + name, 'success'); }
      catch (e) { showToast('✕ Approve failed: ' + e.message, 'error'); }
    },
    async reject(id, name) {
      if (!confirm(`Reject and delete "${name}"? This cannot be undone.`)) return;
      try { await rejectEntry(id); showToast('🗑 Rejected: ' + name, 'success'); }
      catch (e) { showToast('✕ Reject failed: ' + e.message, 'error'); }
    },

    openAdd() { this.editId = null; this.editDoc = blankForm(); this.formErr = ''; },
    openEdit(d) { this.editId = d.id; this.editDoc = formFromDoc(d); this.formErr = ''; },
    closeForm() { this.editDoc = null; this.editId = null; },
    async submitForm() {
      this.formErr = '';
      const data = readForm(this.editDoc);
      if (!data) { this.formErr = '⚠ Product name is required.'; return; }
      const err = validateEntry(data);
      if (err) { this.formErr = '⚠ ' + err; return; }
      this.saving = true;
      try {
        const { approved } = await saveEntry(data, this.editId);
        showToast(this.editId ? '✓ Entry updated: ' + data.name : (approved ? '✓ Entry added and approved: ' + data.name : '✓ Entry submitted as pending: ' + data.name), 'success');
        this.closeForm();
      } catch (e) { this.formErr = '✕ Save failed: ' + e.message; }
      finally { this.saving = false; }
    },

    openDel(d) { this.delTarget = d; },
    async confirmDel() {
      if (!this.delTarget) return;
      try { await deleteEntry(this.delTarget.id); showToast('🗑 Deleted: ' + this.delTarget.name, 'success'); this.delTarget = null; }
      catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
    },

    async doImport() {
      const bc = this.importBarcode.replace(/\D/g, '');
      if (!bc || bc.length < 8) { this.importLog = '⚠ Enter a valid barcode (8–14 digits).'; return; }
      this.importLog = '⏳ Querying Open Food Facts…';
      this.looking = true;
      try {
        const result = await lookupBarcode(bc);
        if (result.exists) { this.importLog = `⚠ Barcode ${bc} already exists in the database.`; return; }
        if (result.notFound) { this.importLog = `✕ Product not found in Open Food Facts for barcode ${bc}.`; return; }
        this.openAdd();
        const p = result.prefill;
        Object.assign(this.editDoc, {
          name: p.name, brand: p.brand, barcode: p.barcode, image: p.image, category: p.category,
          kcal: p.kcal != null ? p.kcal.toFixed(1) : '', pro: p.pro != null ? p.pro.toFixed(1) : '',
          cho: p.cho != null ? p.cho.toFixed(1) : '', fat: p.fat != null ? p.fat.toFixed(1) : '',
          fiber: p.fiber != null ? p.fiber.toFixed(1) : '', sugar: p.sugar != null ? p.sugar.toFixed(1) : '',
          sodium: p.sodium != null ? p.sodium.toFixed(3) : '',
        });
        this.importLog = '✓ Pre-filled — review and save below.';
      } catch (e) { this.importLog = '✕ Lookup failed: ' + e.message; }
      finally { this.looking = false; }
    },
  },
  template: `
    <div class="tab-pane active">
      <div class="content-header"><div class="page-title">Packaged Food DB <span>Submissions · Verify · Publish</span></div></div>
      <div class="kpi-grid" style="margin-bottom:18px">
        <div class="kpi-card c-teal"  data-icon="🍱"><div class="kpi-label">Total Entries</div><div class="kpi-val">{{ kpis.total }}</div><div class="kpi-sub">packaged_foods</div></div>
        <div class="kpi-card c-amber" data-icon="⏳"><div class="kpi-label">Pending</div><div class="kpi-val">{{ kpis.pending }}</div><div class="kpi-sub">Awaiting review</div></div>
        <div class="kpi-card c-green" data-icon="✅"><div class="kpi-label">Verified</div><div class="kpi-val">{{ kpis.verified }}</div><div class="kpi-sub">Live in app</div></div>
        <div class="kpi-card c-blue"  data-icon="🌍"><div class="kpi-label">Countries</div><div class="kpi-val">{{ kpis.countries }}</div><div class="kpi-sub">Origin coverage</div></div>
      </div>

      <div class="la-subnav">
        <button class="la-sntab" :class="{active: panel==='submissions'}" @click="panel='submissions'">⏳ Submissions <span class="nav-badge" style="position:relative;top:0;margin-left:4px">{{ kpis.pending || '—' }}</span></button>
        <button class="la-sntab" :class="{active: panel==='database'}" @click="panel='database'">🍱 Database</button>
        <button class="la-sntab" :class="{active: panel==='import'}" @click="panel='import'">🔲 Quick Import</button>
      </div>

      <!-- Submissions -->
      <div class="la-panel active" v-if="panel==='submissions'">
        <div class="la-toolbar" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <input class="la-search" type="text" v-model="subSearch" placeholder="🔍 Search name, brand, or submitter…" style="flex:2;min-width:180px">
          <span class="la-count-label">{{ subFiltered.length }} submission{{ subFiltered.length !== 1 ? 's' : '' }}</span>
        </div>
        <div class="urm-table-wrap">
          <table class="urm-table la-table">
            <thead><tr><th>Name / Brand</th><th>Submitted by</th><th>Category</th><th>Barcode</th><th>kcal</th><th>Pro g</th><th>CHO g</th><th>Fat g</th><th>Country</th><th>Actions</th></tr></thead>
            <tbody>
              <tr v-if="!subRows.length"><td colspan="10"><div class="empty-state"><div class="empty-state-icon">✅</div>No pending submissions — all caught up!</div></td></tr>
              <tr v-for="d in subRows" :key="d.id">
                <td style="min-width:140px"><strong style="color:var(--text)">{{ d.name || '—' }}</strong><br v-if="d.brand"><span v-if="d.brand" style="font-size:10px;color:var(--text-dim)">{{ d.brand }}</span></td>
                <td><span v-if="d.submittedBy" style="font-size:10px;color:var(--text-dim)">{{ d.submittedBy }}</span><span v-else style="color:var(--text-muted);font-size:10px">—</span></td>
                <td><span class="badge badge-dim" style="font-size:9px">{{ d.category || '—' }}</span></td>
                <td><span v-if="d.barcode" style="font-family:var(--mono);font-size:10px;color:var(--amber)">{{ d.barcode }}</span><span v-else style="color:var(--text-muted);font-size:10px">—</span></td>
                <td style="color:var(--amber);font-weight:600">{{ macro(d.per100g?.kcal) }}</td>
                <td style="color:var(--blue)">{{ macro(d.per100g?.pro) }}</td>
                <td style="color:var(--teal)">{{ macro(d.per100g?.cho) }}</td>
                <td style="color:var(--green)">{{ macro(d.per100g?.fat) }}</td>
                <td>{{ flag(d.country) }}</td>
                <td style="white-space:nowrap">
                  <button class="la-modal-btn la-btn-approve" style="font-size:10px;padding:4px 10px;margin-right:4px" @click="approve(d.id, d.name)">✅ Approve</button>
                  <button class="urm-edit-btn" style="margin-right:4px" @click="openEdit(d)">✏ Edit</button>
                  <button class="urm-edit-btn" style="color:var(--red);border-color:rgba(251,113,133,.4);background:rgba(251,113,133,.06)" @click="reject(d.id, d.name)">✗ Reject</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="la-pagination">
          <button class="la-pg-btn" :disabled="subPage===0" @click="subPage--">← Prev</button>
          <span class="la-pg-info">Page {{ subPage+1 }} / {{ subTotalPages }}</span>
          <button class="la-pg-btn" :disabled="subPage>=subTotalPages-1" @click="subPage++">Next →</button>
        </div>
      </div>

      <!-- Database -->
      <div class="la-panel active" v-if="panel==='database'">
        <div class="la-toolbar" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <input class="la-search" type="text" v-model="search" placeholder="🔍 Search name or brand…" style="flex:2;min-width:180px">
          <select class="la-select" v-model="catFilter"><option value="">All Categories</option><option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option></select>
          <select class="la-select" v-model="countryFilter"><option value="">All Countries</option><option v-for="c in COUNTRIES" :key="c[0]" :value="c[0]">{{ c[1] }}</option></select>
          <div class="chip-group" style="gap:4px">
            <div class="chip" :class="{active: verifiedFilter==='all'}" @click="verifiedFilter='all'">All</div>
            <div class="chip" :class="{active: verifiedFilter==='true'}" @click="verifiedFilter='true'">✅ Verified</div>
            <div class="chip" :class="{active: verifiedFilter==='false'}" @click="verifiedFilter='false'">⏳ Pending</div>
          </div>
          <span class="la-count-label">{{ filtered.length }} entr{{ filtered.length !== 1 ? 'ies' : 'y' }}</span>
          <button class="la-modal-btn la-btn-approve" style="margin-left:auto;white-space:nowrap" @click="openAdd">➕ Add Entry</button>
        </div>
        <div class="urm-table-wrap">
          <table class="urm-table la-table">
            <thead><tr><th>Name / Brand</th><th>Category</th><th>Barcode</th><th>kcal</th><th>Pro g</th><th>CHO g</th><th>Fat g</th><th>Country</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              <tr v-if="!rows.length"><td colspan="10"><div class="empty-state"><div class="empty-state-icon">🍱</div>No entries match — use ➕ Add Entry to start building the database.</div></td></tr>
              <tr v-for="d in rows" :key="d.id">
                <td style="min-width:140px"><strong style="color:var(--text)">{{ d.name || '—' }}</strong><br v-if="d.brand"><span v-if="d.brand" style="font-size:10px;color:var(--text-dim)">{{ d.brand }}</span></td>
                <td><span class="badge badge-dim" style="font-size:9px">{{ d.category || '—' }}</span></td>
                <td><span v-if="d.barcode" style="font-family:var(--mono);font-size:10px;color:var(--amber)">{{ d.barcode }}</span><span v-else style="color:var(--text-muted);font-size:10px">—</span></td>
                <td style="color:var(--amber);font-weight:600">{{ macro(d.per100g?.kcal) }}</td>
                <td style="color:var(--blue)">{{ macro(d.per100g?.pro) }}</td>
                <td style="color:var(--teal)">{{ macro(d.per100g?.cho) }}</td>
                <td style="color:var(--green)">{{ macro(d.per100g?.fat) }}</td>
                <td>{{ flag(d.country) }}</td>
                <td><span v-if="d.verified" class="badge badge-green" style="font-size:9px">✅ Verified</span><span v-else class="badge badge-dim" style="font-size:9px">⏳ Pending</span></td>
                <td style="white-space:nowrap">
                  <button v-if="!d.verified" class="la-modal-btn la-btn-approve" style="font-size:10px;padding:4px 10px;margin-right:4px" @click="approve(d.id, d.name)">✅ Verify</button>
                  <button class="urm-edit-btn" style="margin-right:4px" @click="openEdit(d)">✏ Edit</button>
                  <button class="urm-edit-btn" style="color:var(--red);border-color:rgba(251,113,133,.4);background:rgba(251,113,133,.06)" @click="openDel(d)">🗑</button>
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

      <!-- Quick Import -->
      <div class="la-panel active" v-if="panel==='import'">
        <div class="stg-card" style="margin-top:8px">
          <div class="stg-card-hdr">🔲 Quick Import — Scan Barcode via Open Food Facts</div>
          <div style="padding:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div style="flex:1;min-width:200px">
              <label class="dev-label" style="margin-bottom:6px;display:block">EAN-13 / UPC Barcode</label>
              <input class="dev-input" type="text" v-model="importBarcode" placeholder="e.g. 6009681152934" maxlength="14" @keydown.enter="doImport">
            </div>
            <button class="la-modal-btn la-btn-approve" style="height:38px;padding:0 20px;white-space:nowrap" :disabled="looking" @click="doImport">🔍 Lookup &amp; Pre-fill</button>
          </div>
          <div style="padding:0 14px 14px;font-family:var(--mono);font-size:11px;color:var(--text-dim);min-height:18px">{{ importLog }}</div>
        </div>
      </div>

      <!-- MODAL: Add / Edit Food Entry -->
      <div v-if="editDoc" class="la-overlay" style="display:flex" @click.self="closeForm">
        <div class="la-modal la-modal-wide" style="max-width:680px">
          <div class="la-modal-hdr"><span>{{ editId ? '✏ Edit — ' + editDoc.name : '➕ Add Packaged Food' }}</span><button class="urm-modal-close" @click="closeForm">✕</button></div>
          <div class="la-modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="dev-field" style="grid-column:1/3"><label class="dev-label">Product Name <span style="color:var(--red)">*</span></label><input class="dev-input" v-model="editDoc.name" type="text" maxlength="120" placeholder="e.g. Topsoy Soya Pieces"></div>
            <div class="dev-field"><label class="dev-label">Brand</label><input class="dev-input" v-model="editDoc.brand" type="text" maxlength="80" placeholder="e.g. Topsoy"></div>
            <div class="dev-field"><label class="dev-label">Barcode (EAN-13)</label><input class="dev-input" v-model="editDoc.barcode" type="text" maxlength="14" placeholder="digits only"></div>
            <div class="dev-field"><label class="dev-label">Category</label><select class="dev-input" v-model="editDoc.category"><option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option></select></div>
            <div class="dev-field"><label class="dev-label">Country</label><select class="dev-input" v-model="editDoc.country"><option v-for="c in COUNTRIES" :key="c[0]" :value="c[0]">{{ c[1] }}</option></select></div>
            <div style="grid-column:1/3;margin:4px 0 0;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--teal);text-transform:uppercase">Nutrition — per 100 g</div>
            <div class="dev-field"><label class="dev-label">Energy (kcal) <span style="color:var(--red)">*</span></label><input class="dev-input" v-model="editDoc.kcal" type="number" min="0" step="0.1" placeholder="e.g. 350"></div>
            <div class="dev-field"><label class="dev-label">Energy (kJ)</label><input class="dev-input" v-model="editDoc.kj" type="number" min="0" step="1" placeholder="auto-calc if blank"></div>
            <div class="dev-field"><label class="dev-label">Protein (g) <span style="color:var(--red)">*</span></label><input class="dev-input" v-model="editDoc.pro" type="number" min="0" step="0.1" placeholder="g per 100g"></div>
            <div class="dev-field"><label class="dev-label">Carbohydrate (g) <span style="color:var(--red)">*</span></label><input class="dev-input" v-model="editDoc.cho" type="number" min="0" step="0.1" placeholder="g per 100g"></div>
            <div class="dev-field"><label class="dev-label">Total Fat (g) <span style="color:var(--red)">*</span></label><input class="dev-input" v-model="editDoc.fat" type="number" min="0" step="0.1" placeholder="g per 100g"></div>
            <div class="dev-field"><label class="dev-label">Dietary Fibre (g)</label><input class="dev-input" v-model="editDoc.fiber" type="number" min="0" step="0.1" placeholder="optional"></div>
            <div class="dev-field"><label class="dev-label">Sugar (g)</label><input class="dev-input" v-model="editDoc.sugar" type="number" min="0" step="0.1" placeholder="optional"></div>
            <div class="dev-field"><label class="dev-label">Sodium (g)</label><input class="dev-input" v-model="editDoc.sodium" type="number" min="0" step="0.001" placeholder="optional"></div>
            <div style="grid-column:1/3;margin:4px 0 0;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--amber);text-transform:uppercase">Serving Size (optional)</div>
            <div class="dev-field"><label class="dev-label">Serving Weight (g)</label><input class="dev-input" v-model="editDoc.servingSize" type="number" min="0" step="0.5" placeholder="e.g. 50"></div>
            <div class="dev-field"><label class="dev-label">Serving Label</label><input class="dev-input" v-model="editDoc.servingLabel" type="text" maxlength="60" placeholder="e.g. 1 pack (50g)"></div>
            <div class="dev-field" style="grid-column:1/3"><label class="dev-label">Product Image URL</label><input class="dev-input" v-model="editDoc.image" type="url" placeholder="https://… (optional)"></div>
            <div style="grid-column:1/3;display:flex;align-items:center;gap:10px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-family:var(--mono);font-size:12px;color:var(--text)">
                <input type="checkbox" v-model="editDoc.verified" style="accent-color:var(--green);width:16px;height:16px">
                <span>Mark as Verified <small style="color:var(--text-dim)">(admin-reviewed nutrition data)</small></span>
              </label>
            </div>
          </div>
          <div v-if="formErr" style="padding:8px 18px 0;font-size:11px;color:var(--red);font-family:var(--mono)">{{ formErr }}</div>
          <div class="la-modal-footer">
            <button class="la-modal-btn la-modal-cancel" @click="closeForm">Cancel</button>
            <button class="la-modal-btn la-btn-approve" :disabled="saving" @click="submitForm">{{ saving ? 'Saving…' : (editId ? '💾 Update Entry' : '💾 Save Entry') }}</button>
          </div>
        </div>
      </div>

      <!-- MODAL: Confirm Delete -->
      <div v-if="delTarget" class="la-overlay" style="display:flex" @click.self="delTarget=null">
        <div class="la-modal" style="max-width:400px">
          <div class="la-modal-hdr"><span>🗑 Delete Entry</span><button class="urm-modal-close" @click="delTarget=null">✕</button></div>
          <div class="la-modal-body">
            <p style="color:var(--text);font-size:13px;margin:0 0 8px">Permanently delete <strong style="color:var(--red)">{{ delTarget.name }}</strong>?</p>
            <p style="color:var(--text-dim);font-size:12px;margin:0">This will remove the entry from <code style="color:var(--amber)">packaged_foods</code> and cannot be undone.</p>
          </div>
          <div class="la-modal-footer">
            <button class="la-modal-btn la-modal-cancel" @click="delTarget=null">Cancel</button>
            <button class="la-modal-btn" style="background:rgba(251,113,133,0.15);border-color:rgba(251,113,133,0.5);color:var(--red)" @click="confirmDel">🗑 Delete</button>
          </div>
        </div>
      </div>
    </div>
  `,
};
