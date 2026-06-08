/* ═══════════════════════════════════════════════════════════════════
   library_admin.js — Oasis Admin: Nutrition Resource Library
   ───────────────────────────────────────────────────────────────────
   Version  : 1.1.0
   Author   : Edison Taimu
   Resources backend : Appwrite Databases + Storage
     (project: 6a25de8d000c21cbdbba — Singapore)
   Taxonomy backend  : Firebase Firestore (admin-only)
     • library_categories  — admin-managed categories
     • library_tags        — admin-managed canonical tags
   Requires : appwrite@15 IIFE SDK (CDN, loaded before this script)
              firebase-app-compat, firebase-auth-compat,
              firebase-firestore-compat
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Appwrite config (mirrors main app appwriteClient.js) ──── */
  const AW_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
  const AW_PROJECT  = '6a25de8d000c21cbdbba';
  const AW_DB_ID    = '6a25e03b0031c4391fa4';
  const AW_BKT_ID   = '6a25df33001285e51ee6';
  const AW_COL_ID   = 'library-resources';

  /* ── Firebase collections (taxonomy — stays on Firestore) ──── */
  const COL_CATS = 'library_categories';
  const COL_TAGS = 'library_tags';
  const PAGE_SZ  = 20;

  /* ── Appwrite service instances ────────────────────────────── */
  let _awClient = null;
  let _awDb     = null;
  let _awStor   = null;

  function _initAppwrite() {
    if (typeof Appwrite === 'undefined' || !Appwrite.Client) {
      console.error('[LibAdmin] Appwrite SDK not loaded — add CDN before library_admin.js.');
      return false;
    }
    _awClient = new Appwrite.Client().setEndpoint(AW_ENDPOINT).setProject(AW_PROJECT);
    _awDb     = new Appwrite.Databases(_awClient);
    _awStor   = new Appwrite.Storage(_awClient);
    console.log('[LibAdmin] Appwrite initialised — project:', AW_PROJECT);
    return true;
  }

  /* ── Normalise Appwrite document → internal shape ──────────── */
  /* Appwrite uses $id; createdAt is the upload timestamp.        */
  function _normDoc(doc) {
    return {
      id:           doc.$id,
      title:        doc.title        || '',
      titleLower:   doc.titleLower   || '',
      description:  doc.description  || '',
      category:     doc.category     || '',
      tags:         doc.tags         || [],
      source:       doc.source       || '',
      fileType:     doc.fileType     || '',
      fileId:       doc.fileId       || '',
      externalLink: doc.externalLink || '',
      fileName:     doc.fileName     || '',
      fileSize:     doc.fileSize     || 0,
      uploadedBy:   doc.uploadedBy   || '',
      uploaderName: doc.uploaderName || '',
      uploadedAt:   doc.createdAt    || '',   // alias used by _ts() date column
      status:       doc.status       || 'pending',
      reviewNote:   doc.reviewNote   || '',
      bookmarkCount:doc.bookmarkCount|| 0,
      viewCount:    doc.viewCount    || 0,
      downloadCount:doc.downloadCount|| 0,
    };
  }

  /* ── State ─────────────────────────────────────────────────── */
  let _resources    = [];
  let _categories   = [];
  let _tags         = [];
  let _statusFilter = 'all';
  let _searchQ      = '';
  let _catFilter    = '';
  let _page         = 0;
  let _panel        = 'resources';
  let _editResId    = null;   // resource being edited
  let _reviewId     = null;   // resource being reviewed (approve/reject)
  let _reviewAction = null;   // 'approve' | 'reject'
  let _editCatId    = null;
  let _editTagId    = null;
  let _unsubRes     = null;
  let _initialized  = false;
  let _uploadFile   = null;   // File object pending upload

  /* ── Helpers ───────────────────────────────────────────────── */
  /* _db() is used only for Firestore taxonomy (categories/tags). */
  function _db()   { return window.db || (firebase.apps.length && firebase.firestore()); }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _ts(v) {
    if (!v) return '—';
    const d = v.toDate ? v.toDate() : new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }
  function _toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
    else console.log('[LibAdmin]', msg);
  }
  function _confirm(msg) { return window.confirm(msg); }
  function _el(id) { return document.getElementById(id); }

  /* ── Anonymous auth ────────────────────────────────────────── */
  async function _signInAnon() {
    try {
      if (!firebase.auth) return;
      const auth = firebase.auth();
      if (!auth.currentUser) await auth.signInAnonymously();
    } catch (e) { console.warn('[LibAdmin] anon auth:', e.message); }
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */
  function init() {
    if (_initialized) {
      _renderAll();
      return;
    }
    _initialized = true;
    _initAppwrite();               // Appwrite — resources backend
    _signInAnon().then(() => {     // Firebase anon — Firestore taxonomy
      _listenResources();
      _loadCategories();
      _loadTags();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     APPWRITE RESOURCE LISTENER
     Fetches all documents from Appwrite Databases and subscribes
     to Realtime for live create/update/delete events.
  ══════════════════════════════════════════════════════════════ */
  async function _fetchAllResources() {
    if (!_awDb) return;
    try {
      const resp = await _awDb.listDocuments(AW_DB_ID, AW_COL_ID, [
        Appwrite.Query.orderDesc('createdAt'),
        Appwrite.Query.limit(300),
      ]);
      _resources = resp.documents.map(_normDoc);
      _updateKPIs();
      _renderResourcesTable();
      _updateCatFilter();
    } catch (e) {
      console.error('[LibAdmin] fetchAllResources:', e);
    }
  }

  function _listenResources() {
    if (!_awClient) return;
    // Tear down any previous subscription
    if (_unsubRes) { try { _unsubRes(); } catch(e) {} _unsubRes = null; }
    // Initial fetch
    _fetchAllResources();
    // Realtime — re-fetch on any document event in the collection
    const channel = 'databases.' + AW_DB_ID + '.collections.' + AW_COL_ID + '.documents';
    _unsubRes = _awClient.subscribe(channel, function() {
      _fetchAllResources();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — Categories & Tags (taxonomy, admin-only)
  ══════════════════════════════════════════════════════════════ */
  /* Default clinical nutrition categories — seeded once if collection is empty */
  const DEFAULT_CATEGORIES = [
    { id: 'clinical_assessment',    name: 'Clinical Assessment' },
    { id: 'enteral_nutrition',      name: 'Enteral Nutrition' },
    { id: 'parenteral_nutrition',   name: 'Parenteral Nutrition' },
    { id: 'malnutrition',           name: 'Malnutrition & Undernutrition' },
    { id: 'renal_nutrition',        name: 'Renal Nutrition' },
    { id: 'diabetes_nutrition',     name: 'Diabetes & Metabolic' },
    { id: 'oncology_nutrition',     name: 'Oncology Nutrition' },
    { id: 'pediatric_nutrition',    name: 'Paediatric Nutrition' },
    { id: 'critical_care',          name: 'Critical Care Nutrition' },
    { id: 'gi_hepatic',             name: 'GI & Hepatic Nutrition' },
    { id: 'food_drug_interactions', name: 'Food–Drug Interactions' },
    { id: 'community_nutrition',    name: 'Community & Public Health' },
  ];

  async function _seedDefaultCategories(db) {
    const batch = db.batch();
    DEFAULT_CATEGORIES.forEach(cat => {
      const ref = db.collection(COL_CATS).doc(cat.id);
      batch.set(ref, {
        id:        cat.id,
        name:      cat.name,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    console.log('[LibAdmin] Seeded', DEFAULT_CATEGORIES.length, 'default categories.');
  }

  async function _loadCategories() {
    const d = _db(); if (!d) return;
    try {
      const snap = await d.collection(COL_CATS).orderBy('name').get();
      if (snap.empty) {
        // First-ever load — seed defaults then re-fetch
        await _seedDefaultCategories(d);
        const seeded = await d.collection(COL_CATS).orderBy('name').get();
        _categories = seeded.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } else {
        _categories = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      _renderCategoriesPanel();
      _updateCatFilter();
    } catch(e) { console.error('[LibAdmin] load cats:', e); }
  }

  async function _loadTags() {
    const d = _db(); if (!d) return;
    try {
      const snap = await d.collection(COL_TAGS).orderBy('name').get();
      _tags = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      _renderTagsPanel();
    } catch(e) { console.error('[LibAdmin] load tags:', e); }
  }

  /* ══════════════════════════════════════════════════════════════
     KPI CARDS
  ══════════════════════════════════════════════════════════════ */
  function _updateKPIs() {
    const pending  = _resources.filter(r => r.status === 'pending').length;
    const approved = _resources.filter(r => r.status === 'approved').length;
    const rejected = _resources.filter(r => r.status === 'rejected').length;
    const total    = _resources.length;
    const set = (id, val) => { const el = _el(id); if (el) el.textContent = val; };
    set('lib-kpi-pending',  pending);
    set('lib-kpi-approved', approved);
    set('lib-kpi-rejected', rejected);
    set('lib-kpi-total',    total);
    // Badge on nav item
    const badge = _el('nb-library');
    if (badge) badge.textContent = pending > 0 ? pending : '—';
  }

  /* ══════════════════════════════════════════════════════════════
     RESOURCES TABLE
  ══════════════════════════════════════════════════════════════ */
  function _filtered() {
    return _resources.filter(r => {
      if (_statusFilter && _statusFilter !== 'all' && r.status !== _statusFilter) return false;
      if (_catFilter && r.category !== _catFilter) return false;
      if (_searchQ) {
        const q = _searchQ.toLowerCase();
        const hay = [r.title, r.description, r.source, r.uploaderName]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function _renderResourcesTable() {
    const tbody = _el('la-resources-tbody');
    if (!tbody) return;

    const rows = _filtered();
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SZ));
    if (_page >= totalPages) _page = 0;
    const slice = rows.slice(_page * PAGE_SZ, (_page + 1) * PAGE_SZ);

    // count label
    const countEl = _el('la-count');
    if (countEl) countEl.textContent = total + ' resource' + (total !== 1 ? 's' : '');

    // pagination
    const pgInfo = _el('la-pg-info');
    const pgPrev = _el('la-pg-prev');
    const pgNext = _el('la-pg-next');
    if (pgInfo) pgInfo.textContent = 'Page ' + (_page + 1) + ' / ' + totalPages;
    if (pgPrev) pgPrev.disabled = _page === 0;
    if (pgNext) pgNext.disabled = _page >= totalPages - 1;

    if (!slice.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:28px 0">No resources match this filter.</td></tr>';
      return;
    }

    tbody.innerHTML = slice.map(r => {
      const badge = _statusBadge(r.status);
      const tags  = Array.isArray(r.tags) ? r.tags.slice(0,3).map(t=>`<span class="la-tag">${_esc(t)}</span>`).join('') : '';
      const catLabel = _catName(r.category);
      return `
      <tr>
        <td>
          <div class="la-title-cell">
            <span class="la-res-title" title="${_esc(r.title)}">${_esc(r.title)}</span>
            ${tags ? '<div class="la-tag-row">' + tags + '</div>' : ''}
          </div>
        </td>
        <td><span class="la-cat-chip">${_esc(catLabel)}</span></td>
        <td><span class="la-type-chip">${_esc(r.fileType || '—')}</span></td>
        <td class="la-uploader">${_esc(r.uploaderName || '—')}</td>
        <td class="la-date">${_ts(r.uploadedAt)}</td>
        <td>${badge}</td>
        <td>
          <div class="la-actions">
            ${r.status !== 'approved' ? `<button class="la-btn la-btn-approve" onclick="LibAdmin.openReviewModal('${r.id}','approve')" title="Approve">✓ Approve</button>` : ''}
            ${r.status !== 'rejected' ? `<button class="la-btn la-btn-reject"  onclick="LibAdmin.openReviewModal('${r.id}','reject')"  title="Reject">✕ Reject</button>` : ''}
            <button class="la-btn la-btn-edit"   onclick="LibAdmin.openEditModal('${r.id}')"   title="Edit">✎ Edit</button>
            <button class="la-btn la-btn-delete" onclick="LibAdmin.deleteResource('${r.id}')" title="Delete">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function _statusBadge(status) {
    const map = {
      pending:  '<span class="la-badge la-badge-pending">⏳ Pending</span>',
      approved: '<span class="la-badge la-badge-approved">✅ Approved</span>',
      rejected: '<span class="la-badge la-badge-rejected">❌ Rejected</span>',
    };
    return map[status] || '<span class="la-badge">—</span>';
  }

  function _catName(catId) {
    const found = _categories.find(c => c.id === catId);
    return found ? found.name : (catId || '—');
  }

  function _updateCatFilter() {
    const sel = _el('la-cat-filter');
    if (!sel) return;
    // Collect categories from resources + saved categories
    const catIds = new Set();
    _resources.forEach(r => { if (r.category) catIds.add(r.category); });
    _categories.forEach(c => catIds.add(c.id));
    const opts = ['<option value="">All Categories</option>'];
    catIds.forEach(id => {
      const name = _catName(id);
      opts.push(`<option value="${_esc(id)}" ${_catFilter === id ? 'selected' : ''}>${_esc(name)}</option>`);
    });
    sel.innerHTML = opts.join('');
  }

  function _renderAll() {
    _updateKPIs();
    _renderResourcesTable();
    _renderCategoriesPanel();
    _renderTagsPanel();
  }

  /* ══════════════════════════════════════════════════════════════
     FILTERS & SEARCH
  ══════════════════════════════════════════════════════════════ */
  function setStatusFilter(el, val) {
    _statusFilter = val;
    _page = 0;
    document.querySelectorAll('#la-status-filter .chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    _renderResourcesTable();
  }

  function onSearch(val) {
    _searchQ = (val || '').trim();
    _page = 0;
    _renderResourcesTable();
  }

  function setCatFilter(val) {
    _catFilter = val;
    _page = 0;
    _renderResourcesTable();
  }

  function nextPage() { _page++; _renderResourcesTable(); }
  function prevPage() { if (_page > 0) { _page--; _renderResourcesTable(); } }

  /* ══════════════════════════════════════════════════════════════
     SUB-NAV PANELS
  ══════════════════════════════════════════════════════════════ */
  function switchPanel(panel) {
    _panel = panel;
    document.querySelectorAll('.la-sntab').forEach(b => {
      b.classList.toggle('active', b.dataset.panel === panel);
    });
    document.querySelectorAll('.la-panel').forEach(p => {
      p.classList.toggle('active', p.id === 'la-panel-' + panel);
    });
    if (panel === 'categories') _renderCategoriesPanel();
    if (panel === 'tags')       _renderTagsPanel();
  }

  /* ══════════════════════════════════════════════════════════════
     REVIEW MODAL (Approve / Reject)
  ══════════════════════════════════════════════════════════════ */
  function openReviewModal(id, action) {
    const r = _resources.find(x => x.id === id);
    if (!r) return;
    _reviewId = id;
    _reviewAction = action;

    const overlay = _el('la-review-overlay');
    _el('la-review-title').textContent  = action === 'approve' ? '✅ Approve Resource' : '❌ Reject Resource';
    _el('la-review-res-title').textContent = r.title || '—';
    _el('la-review-note').value = r.reviewNote || '';
    _el('la-review-note').placeholder = action === 'approve'
      ? 'Optional note for uploader…'
      : 'Reason for rejection (shown to uploader)…';
    _el('la-review-confirm-btn').textContent = action === 'approve' ? '✅ Approve' : '❌ Reject';
    _el('la-review-confirm-btn').className   = 'la-modal-btn ' + (action === 'approve' ? 'la-btn-approve' : 'la-btn-reject');
    overlay.style.display = 'flex';
  }

  function closeReviewModal() {
    _el('la-review-overlay').style.display = 'none';
    _reviewId = null; _reviewAction = null;
  }

  async function confirmReview() {
    const id = _reviewId, action = _reviewAction;
    if (!id || !action) return;
    const note = (_el('la-review-note').value || '').trim();
    if (!_awDb) { _toast('Appwrite not initialised.', 'error'); return; }

    const btn = _el('la-review-confirm-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
      await _awDb.updateDocument(AW_DB_ID, AW_COL_ID, id, {
        status:     action === 'approve' ? 'approved' : 'rejected',
        reviewNote: note,
      });
      closeReviewModal();
      _toast(action === 'approve' ? '✅ Resource approved.' : '❌ Resource rejected.', 'success');
    } catch (e) {
      _toast('Error: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = action === 'approve' ? '✅ Approve' : '❌ Reject';
    }
  }

  /* ══════════════════════════════════════════════════════════════
     EDIT RESOURCE MODAL
  ══════════════════════════════════════════════════════════════ */
  async function openEditModal(id) {
    const r = _resources.find(x => x.id === id);
    if (!r) return;
    _editResId = id;

    // Ensure categories are loaded before populating the dropdown
    if (!_categories.length) await _loadCategories();

    // Build category options
    const catOpts = _categories.map(c =>
      `<option value="${_esc(c.id)}" ${r.category===c.id?'selected':''}>${_esc(c.name)}</option>`
    ).join('');

    _el('la-edit-title').value       = r.title || '';
    _el('la-edit-desc').value        = r.description || '';
    _el('la-edit-source').value      = r.source || '';
    _el('la-edit-category').innerHTML= '<option value="">— Select —</option>' + catOpts;
    _el('la-edit-category').value    = r.category || '';
    _el('la-edit-tags').value        = Array.isArray(r.tags) ? r.tags.join(', ') : '';
    _el('la-edit-status').value      = r.status || 'pending';
    _el('la-edit-overlay').style.display = 'flex';
  }

  function closeEditModal() {
    _el('la-edit-overlay').style.display = 'none';
    _editResId = null;
  }

  async function saveResourceEdit() {
    const id = _editResId; if (!id) return;
    if (!_awDb) { _toast('Appwrite not initialised.', 'error'); return; }

    const title    = (_el('la-edit-title').value  || '').trim();
    const desc     = (_el('la-edit-desc').value   || '').trim();
    const source   = (_el('la-edit-source').value || '').trim();
    const category = _el('la-edit-category').value;
    const tagsRaw  = (_el('la-edit-tags').value   || '');
    const status   = _el('la-edit-status').value;
    const tags     = tagsRaw.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10);

    if (!title)  { _toast('Title is required.', 'warning'); return; }
    if (!desc)   { _toast('Description is required.', 'warning'); return; }
    if (!source) { _toast('Source is required.', 'warning'); return; }

    const btn = _el('la-edit-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
      await _awDb.updateDocument(AW_DB_ID, AW_COL_ID, id, {
        title,
        titleLower:  title.toLowerCase(),
        description: desc,
        source,
        category,
        tags,
        status,
      });
      closeEditModal();
      _toast('✎ Resource updated.', 'success');
    } catch (e) {
      _toast('Error: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '💾 Save Changes';
    }
  }

  /* ══════════════════════════════════════════════════════════════
     UPLOAD RESOURCE MODAL
  ══════════════════════════════════════════════════════════════ */
  function _formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024)    return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  function _detectFileType(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const map = {
      pdf: 'PDF',
      doc: 'DOCX', docx: 'DOCX',
      ppt: 'PPTX', pptx: 'PPTX',
      xls: 'XLSX', xlsx: 'XLSX', csv: 'XLSX',
      zip: 'ZIP', rar: 'ZIP', '7z': 'ZIP',
      jpg: 'Image', jpeg: 'Image', png: 'Image',
      gif: 'Image', svg: 'Image', webp: 'Image',
      mp4: 'Video', mov: 'Video',
    };
    return map[ext] || ext.toUpperCase() || 'File';
  }

  function _fileTypeIcon(type) {
    const icons = {
      PDF: '📄', DOCX: '📝', PPTX: '📊', XLSX: '📈',
      ZIP: '🗜', Image: '🖼', Video: '🎬',
    };
    return icons[type] || '📎';
  }

  function _resetUploadModal() {
    _uploadFile = null;
    const inp = _el('la-upload-file-input');
    if (inp) inp.value = '';
    const dz = _el('la-upload-drop-zone');
    if (dz) { dz.classList.remove('has-file', 'drag-over'); }
    const hide = ['la-upload-file-card', 'la-upload-progress-section', 'la-upload-status-msg', 'la-upload-form-fields'];
    hide.forEach(id => { const el = _el(id); if (el) el.style.display = 'none'; });
    ['la-upload-title', 'la-upload-source', 'la-upload-tags'].forEach(id => {
      const el = _el(id); if (el) el.value = '';
    });
    const descEl = _el('la-upload-desc'); if (descEl) descEl.value = '';
    const btn = _el('la-upload-submit-btn');
    if (btn) { btn.disabled = false; btn.textContent = '📤 Upload'; }
    const fill = _el('la-upload-progress-fill');
    if (fill) fill.style.width = '0%';
  }

  async function openUploadModal() {
    _resetUploadModal();
    // Ensure categories are loaded before populating the dropdown
    if (!_categories.length) await _loadCategories();
    // Populate category dropdown
    const catOpts = _categories.map(c =>
      `<option value="${_esc(c.id)}">${_esc(c.name)}</option>`
    ).join('');
    const catSel = _el('la-upload-category');
    if (catSel) catSel.innerHTML = '<option value="">— No Category —</option>' + catOpts;
    _el('la-upload-overlay').style.display = 'flex';
  }

  function closeUploadModal() {
    _el('la-upload-overlay').style.display = 'none';
    _uploadFile = null;
  }

  function onUploadFileSelect(input) {
    const file = input.files && input.files[0];
    if (file) _setUploadFile(file);
  }

  function onUploadDrop(e) {
    e.preventDefault();
    const dz = _el('la-upload-drop-zone');
    if (dz) dz.classList.remove('drag-over');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) _setUploadFile(file);
  }

  function onUploadDragOver(e) {
    e.preventDefault();
    const dz = _el('la-upload-drop-zone');
    if (dz) dz.classList.add('drag-over');
  }

  function onUploadDragLeave() {
    const dz = _el('la-upload-drop-zone');
    if (dz) dz.classList.remove('drag-over');
  }

  function _setUploadFile(file) {
    _uploadFile = file;
    const type = _detectFileType(file);
    const icon = _fileTypeIcon(type);
    const size = _formatFileSize(file.size);
    const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

    // Auto-populate title if blank
    const titleEl = _el('la-upload-title');
    if (titleEl && !titleEl.value) {
      titleEl.value = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    }

    // Update drop zone visual
    const dz = _el('la-upload-drop-zone');
    if (dz) dz.classList.add('has-file');
    const dzIcon = _el('la-upload-drop-icon');
    if (dzIcon) dzIcon.textContent = icon;

    // Show file card
    const card = _el('la-upload-file-card');
    if (card) {
      _el('la-upload-fcard-icon').textContent = icon;
      _el('la-upload-fcard-name').textContent = file.name;
      _el('la-upload-fcard-size').textContent = size;
      _el('la-upload-fcard-type').textContent = type;
      card.style.display = 'flex';
    }

    // Show form fields
    const fields = _el('la-upload-form-fields');
    if (fields) fields.style.display = 'block';

    // Hide progress from previous attempt
    const prog = _el('la-upload-progress-section');
    if (prog) prog.style.display = 'none';
    const statusMsg = _el('la-upload-status-msg');
    if (statusMsg) statusMsg.style.display = 'none';
  }

  function _setUploadStatus(msg, type) {
    // type: '' | 'uploading' | 'success' | 'error'
    const el = _el('la-upload-status-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'la-upload-status-msg' + (type ? ' la-upload-status--' + type : '');
    el.style.display = msg ? 'block' : 'none';
  }

  async function uploadResource() {
    if (!_uploadFile) { _toast('Please select a file first.', 'warning'); return; }
    if (!_awStor || !_awDb) { _toast('Appwrite not initialised.', 'error'); return; }

    const title   = (_el('la-upload-title').value  || '').trim();
    const desc    = (_el('la-upload-desc').value   || '').trim();
    const source  = (_el('la-upload-source').value || '').trim();
    const cat     = _el('la-upload-category').value || '';
    const tagsRaw = _el('la-upload-tags').value    || '';
    const tags    = tagsRaw.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10);

    if (!title) { _toast('Title is required.', 'warning'); return; }
    if (!desc)  { _toast('Description is required.', 'warning'); return; }

    const btn = _el('la-upload-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Uploading…';

    // Show progress section
    const progSection = _el('la-upload-progress-section');
    const progFill    = _el('la-upload-progress-fill');
    const progPct     = _el('la-upload-progress-pct');
    const progSizes   = _el('la-upload-progress-sizes');
    progSection.style.display = 'block';
    progFill.style.width = '0%';
    progPct.textContent  = '0%';
    progSizes.textContent = '0 B / ' + _formatFileSize(_uploadFile.size);

    _setUploadStatus('⬆️ Uploading file to Appwrite Storage…', 'uploading');

    const fileId   = Appwrite.ID.unique();
    const fileType = _detectFileType(_uploadFile);
    const totalSize = _uploadFile.size;

    try {
      /* ── Step 1: Upload file to Appwrite Storage ─────────── */
      const fileResp = await _awStor.createFile(
        AW_BKT_ID,
        fileId,
        _uploadFile,
        [],  // permissions (bucket defaults apply)
        (progress) => {
          const pct = Math.min(100, Math.round(progress.progress || 0));
          progFill.style.width = pct + '%';
          progPct.textContent  = pct + '%';
          progSizes.textContent = _formatFileSize(progress.sizeUploaded || 0) +
                                  ' / ' + _formatFileSize(totalSize);
        }
      );

      // Full bar
      progFill.style.width = '100%';
      progPct.textContent  = '100%';
      progSizes.textContent = _formatFileSize(totalSize) + ' / ' + _formatFileSize(totalSize);

      /* ── Step 2: Build storage view URL ───────────────────── */
      const storageUrl = AW_ENDPOINT +
        '/storage/buckets/' + AW_BKT_ID +
        '/files/' + fileResp.$id +
        '/view?project=' + AW_PROJECT;

      /* ── Step 3: Resolve uploader info from Firebase auth ─── */
      let uploadedBy   = 'admin';
      let uploaderName = 'Admin';
      try {
        const fbUser = firebase.auth && firebase.auth().currentUser;
        if (fbUser) {
          uploadedBy   = fbUser.uid;
          uploaderName = fbUser.displayName || fbUser.email || 'Admin';
        }
      } catch (_ignore) {}

      /* ── Step 4: Create library-resources document ────────── */
      _setUploadStatus('💾 Creating library record…', 'uploading');
      await _awDb.createDocument(AW_DB_ID, AW_COL_ID, Appwrite.ID.unique(), {
        title,
        titleLower:    title.toLowerCase(),
        description:   desc,
        source:        source || 'Admin Upload',
        category:      cat,
        tags,
        fileType,
        fileId:        fileResp.$id,
        fileName:      _uploadFile.name,
        fileSize:      totalSize,
        externalLink:  storageUrl,
        uploadedBy,
        uploaderName,
        status:        'approved',  // admin uploads publish immediately
        createdAt:     new Date().toISOString(),
        reviewNote:    '',
        bookmarkCount: 0,
        viewCount:     0,
        downloadCount: 0,
      });

      _setUploadStatus('✅ Upload complete! Resource published to library.', 'success');
      btn.textContent = '✅ Done';
      _toast('✅ Resource uploaded and published.', 'success');
      // Auto-close after a short pause
      setTimeout(() => closeUploadModal(), 1800);

    } catch (e) {
      console.error('[LibAdmin] uploadResource error:', e);
      const msg = (e && e.message) ? e.message : 'Unknown error';
      _setUploadStatus('❌ Upload failed: ' + msg, 'error');
      btn.disabled = false;
      btn.textContent = '📤 Retry Upload';
      _toast('Upload failed: ' + msg, 'error');
    }
  }

  /* ══════════════════════════════════════════════════════════════
     DELETE RESOURCE
  ══════════════════════════════════════════════════════════════ */
  async function deleteResource(id) {
    const r = _resources.find(x => x.id === id);
    if (!r) return;
    if (!_confirm(`Delete "${r.title}"?\nThis cannot be undone.`)) return;
    if (!_awDb) { _toast('Appwrite not initialised.', 'error'); return; }

    try {
      // Delete Appwrite Storage file if present
      if (r.fileId && _awStor) {
        try {
          await _awStor.deleteFile(AW_BKT_ID, r.fileId);
        } catch (se) {
          console.warn('[LibAdmin] Storage delete skipped:', se.message);
        }
      }
      await _awDb.deleteDocument(AW_DB_ID, AW_COL_ID, id);
      _toast('🗑 Resource deleted.', 'success');
    } catch (e) {
      _toast('Delete failed: ' + e.message, 'error');
    }
  }

  /* ══════════════════════════════════════════════════════════════
     CATEGORIES PANEL
  ══════════════════════════════════════════════════════════════ */
  function _renderCategoriesPanel() {
    const tbody = _el('la-cat-tbody');
    if (!tbody) return;

    if (!_categories.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:24px 0">No categories yet. Add one above.</td></tr>';
      return;
    }

    // Count resources per category
    const counts = {};
    _resources.forEach(r => { counts[r.category] = (counts[r.category] || 0) + 1; });

    tbody.innerHTML = _categories.map(c => `
      <tr>
        <td><strong>${_esc(c.name)}</strong></td>
        <td><code style="font-size:11px;color:var(--text-dim)">${_esc(c.id)}</code></td>
        <td>${counts[c.id] || 0}</td>
        <td>
          <div class="la-actions">
            <button class="la-btn la-btn-edit"   onclick="LibAdmin.openEditCat('${_esc(c.id)}')">✎ Edit</button>
            <button class="la-btn la-btn-delete" onclick="LibAdmin.deleteCat('${_esc(c.id)}')">🗑</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async function addCategory() {
    const nameEl = _el('la-cat-name');
    const idEl   = _el('la-cat-id');
    const name = (nameEl.value || '').trim();
    const id   = (idEl.value   || '').trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    if (!name) { _toast('Category name is required.', 'warning'); return; }
    if (!id)   { _toast('Category ID is required.', 'warning'); return; }
    if (_categories.find(c => c.id === id)) { _toast('Category ID already exists.', 'warning'); return; }

    const d = _db(); if (!d) return;
    try {
      await d.collection(COL_CATS).doc(id).set({
        name, id,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      nameEl.value = ''; idEl.value = '';
      await _loadCategories();
      _toast('✅ Category added.', 'success');
    } catch (e) { _toast('Error: ' + e.message, 'error'); }
  }

  function openEditCat(id) {
    const c = _categories.find(x => x.id === id);
    if (!c) return;
    _editCatId = id;
    _el('la-edit-cat-name').value = c.name;
    _el('la-edit-cat-id-display').textContent = c.id;
    _el('la-cat-modal-overlay').style.display = 'flex';
  }

  function closeEditCat() {
    _el('la-cat-modal-overlay').style.display = 'none';
    _editCatId = null;
  }

  async function saveEditCat() {
    const id = _editCatId; if (!id) return;
    const name = (_el('la-edit-cat-name').value || '').trim();
    if (!name) { _toast('Name is required.', 'warning'); return; }
    const d = _db(); if (!d) return;
    const btn = _el('la-cat-save-btn');
    btn.disabled = true;
    try {
      await d.collection(COL_CATS).doc(id).update({ name });
      closeEditCat();
      await _loadCategories();
      _toast('✅ Category updated.', 'success');
    } catch (e) { _toast('Error: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  }

  async function deleteCat(id) {
    const c = _categories.find(x => x.id === id);
    const count = _resources.filter(r => r.category === id).length;
    const msg = count > 0
      ? `Delete category "${c?.name}"?\n${count} resource(s) use it. They will have no category.`
      : `Delete category "${c?.name}"?`;
    if (!_confirm(msg)) return;
    const d = _db(); if (!d) return;
    try {
      await d.collection(COL_CATS).doc(id).delete();
      await _loadCategories();
      _updateCatFilter();
      _toast('🗑 Category deleted.', 'success');
    } catch (e) { _toast('Error: ' + e.message, 'error'); }
  }

  /* ══════════════════════════════════════════════════════════════
     TAGS PANEL
  ══════════════════════════════════════════════════════════════ */
  function _renderTagsPanel() {
    const tbody = _el('la-tags-tbody');
    if (!tbody) return;

    if (!_tags.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px 0">No tags yet. Add one above.</td></tr>';
      return;
    }

    // Count usage across resources
    const counts = {};
    _resources.forEach(r => {
      (r.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    });

    tbody.innerHTML = _tags.map(t => `
      <tr>
        <td><span class="la-tag">${_esc(t.name)}</span></td>
        <td>${counts[t.name] || 0}</td>
        <td>
          <div class="la-actions">
            <button class="la-btn la-btn-edit"   onclick="LibAdmin.openEditTag('${_esc(t.id)}')">✎ Edit</button>
            <button class="la-btn la-btn-delete" onclick="LibAdmin.deleteTag('${_esc(t.id)}')">🗑</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async function addTag() {
    const inp = _el('la-tag-name');
    const name = (inp.value || '').trim().toLowerCase();
    if (!name) { _toast('Tag name is required.', 'warning'); return; }
    if (_tags.find(t => t.name === name)) { _toast('Tag already exists.', 'warning'); return; }
    const d = _db(); if (!d) return;
    try {
      const ref = await d.collection(COL_TAGS).add({
        name, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      inp.value = '';
      await _loadTags();
      _toast('✅ Tag added.', 'success');
    } catch (e) { _toast('Error: ' + e.message, 'error'); }
  }

  function openEditTag(id) {
    const t = _tags.find(x => x.id === id);
    if (!t) return;
    _editTagId = id;
    _el('la-edit-tag-name').value = t.name;
    _el('la-tag-modal-overlay').style.display = 'flex';
  }

  function closeEditTag() {
    _el('la-tag-modal-overlay').style.display = 'none';
    _editTagId = null;
  }

  async function saveEditTag() {
    const id = _editTagId; if (!id) return;
    const name = (_el('la-edit-tag-name').value || '').trim().toLowerCase();
    if (!name) { _toast('Tag name is required.', 'warning'); return; }
    const d = _db(); if (!d) return;
    const btn = _el('la-tag-save-btn');
    btn.disabled = true;
    try {
      await d.collection(COL_TAGS).doc(id).update({ name });
      closeEditTag();
      await _loadTags();
      _toast('✅ Tag updated.', 'success');
    } catch (e) { _toast('Error: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  }

  async function deleteTag(id) {
    const t = _tags.find(x => x.id === id);
    const count = _resources.filter(r => (r.tags||[]).includes(t?.name)).length;
    const msg = count > 0
      ? `Delete tag "${t?.name}"?\nUsed in ${count} resource(s).`
      : `Delete tag "${t?.name}"?`;
    if (!_confirm(msg)) return;
    const d = _db(); if (!d) return;
    try {
      await d.collection(COL_TAGS).doc(id).delete();
      await _loadTags();
      _toast('🗑 Tag deleted.', 'success');
    } catch (e) { _toast('Error: ' + e.message, 'error'); }
  }

  /* ══════════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════════ */
  window.LibAdmin = {
    init,
    switchPanel,
    // Filters
    setStatusFilter,
    onSearch,
    setCatFilter,
    nextPage,
    prevPage,
    // Resource moderation
    openReviewModal,
    closeReviewModal,
    confirmReview,
    openEditModal,
    closeEditModal,
    saveResourceEdit,
    deleteResource,
    // Upload Resource
    openUploadModal,
    closeUploadModal,
    onUploadFileSelect,
    onUploadDrop,
    onUploadDragOver,
    onUploadDragLeave,
    uploadResource,
    // Categories
    addCategory,
    openEditCat,
    closeEditCat,
    saveEditCat,
    deleteCat,
    // Tags
    addTag,
    openEditTag,
    closeEditTag,
    saveEditTag,
    deleteTag,
  };

})();
