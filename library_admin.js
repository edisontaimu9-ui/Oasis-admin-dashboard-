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
  let _storageFiles = [];   // Appwrite Storage bucket file list
  let _uploadBusy   = false;
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

  /* ── Helpers ───────────────────────────────────────────────── */
  /* _db() is used only for Firestore taxonomy (categories/tags). */
  function _db()   { return window.db || (firebase.apps.length && firebase.firestore()); }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _fmtBytes(n) {
    if (n < 1024)           return n + ' B';
    if (n < 1024 * 1024)    return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }
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
     APPWRITE STORAGE PANEL
  ══════════════════════════════════════════════════════════════ */

  /** Fetch all files in the Appwrite Storage bucket. */
  async function _fetchStorageFiles() {
    if (!_awStor) return;
    try {
      const resp = await _awStor.listFiles(AW_BKT_ID);
      _storageFiles = resp.files || [];
      _renderStoragePanel();
    } catch (e) {
      console.error('[LibAdmin] fetchStorageFiles:', e);
    }
  }

  /**
   * Render the bucket files table.
   * Cross-references _resources by fileId to detect orphaned files.
   */
  function _renderStoragePanel() {
    const tbody = _el('aw-storage-tbody');
    if (!tbody) return;

    // Keep category select in sync with loaded categories
    const catSel = _el('aw-up-category');
    if (catSel) {
      catSel.innerHTML = '<option value="">— Select —</option>' +
        _categories.map(c =>
          `<option value="${_esc(c.id)}">${_esc(c.name)}</option>`
        ).join('');
    }

    if (!_storageFiles.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:28px 0">No files in bucket.</td></tr>';
      return;
    }

    tbody.innerHTML = _storageFiles.map(function(f) {
      const linked  = _resources.find(function(r) { return r.fileId === f.$id; });
      const size    = _fmtBytes(f.sizeOriginal || 0);
      const date    = _ts(f.$createdAt);
      const mime    = (f.mimeType || '').split('/')[1] || '—';

      const linkedHtml = linked
        ? `<span class="la-badge la-badge-approved" title="${_esc(linked.title)}">✅ ${_esc(linked.title.length > 30 ? linked.title.slice(0,30) + '…' : linked.title)}</span>`
        : '<span class="la-badge la-badge-pending" style="background:rgba(255,160,0,.15);color:#ffa000">⚠ Orphan</span>';

      // Build a view URL via the REST endpoint (no SDK method needed)
      const viewUrl = AW_ENDPOINT + '/storage/buckets/' + AW_BKT_ID + '/files/' + f.$id + '/view?project=' + AW_PROJECT;

      return `
      <tr>
        <td style="font-size:12px;word-break:break-all;max-width:200px">${_esc(f.name)}</td>
        <td style="white-space:nowrap">${size}</td>
        <td style="font-size:11px;color:var(--text-dim)">${_esc(mime)}</td>
        <td>${linkedHtml}</td>
        <td class="la-date">${date}</td>
        <td>
          <div class="la-actions">
            <a class="la-btn" href="${viewUrl}" target="_blank" rel="noopener" title="Open file">👁 View</a>
            ${linked
              ? `<button class="la-btn la-btn-delete" onclick="LibAdmin.deleteFileAndRecord('${_esc(f.$id)}','${_esc(linked.id)}')" title="Delete file + DB record">🗑 File+Record</button>`
              : `<button class="la-btn la-btn-delete" onclick="LibAdmin.deleteFileOnly('${_esc(f.$id)}')" title="Delete file only">🗑 File</button>`
            }
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  /** Toggle file input vs URL input based on selected type. */
  function onUploadTypeChange() {
    const type = (_el('aw-up-type') || {}).value;
    const fw = _el('aw-up-file-wrap');
    const lw = _el('aw-up-link-wrap');
    if (fw) fw.style.display = type === 'link' ? 'none' : '';
    if (lw) lw.style.display = type === 'link' ? ''     : 'none';
  }

  /** Admin direct upload: uploads file to Appwrite Storage then creates DB record. */
  async function submitAdminUpload() {
    if (_uploadBusy) return;
    if (!_awDb || !_awStor) { _toast('Appwrite not initialised.', 'error'); return; }

    const title    = (_el('aw-up-title').value  || '').trim();
    const desc     = (_el('aw-up-desc').value   || '').trim();
    const source   = (_el('aw-up-source').value || '').trim();
    const category = (_el('aw-up-category').value || '');
    const status   = (_el('aw-up-status').value   || 'approved');
    const type     = (_el('aw-up-type').value     || 'pdf');
    const tagsRaw  = (_el('aw-up-tags').value     || '');
    const tags     = tagsRaw.split(',').map(function(t){return t.trim().toLowerCase();}).filter(Boolean).slice(0, 10);
    const fileEl   = _el('aw-up-file');
    const linkEl   = _el('aw-up-link');
    const file     = fileEl && fileEl.files[0];
    const extLink  = (linkEl && linkEl.value || '').trim();

    if (!title)                              { _toast('Title is required.', 'warning');        return; }
    if (!desc)                               { _toast('Description is required.', 'warning');  return; }
    if (!source)                             { _toast('Source is required.', 'warning');        return; }
    if (type === 'link' && !extLink)         { _toast('External URL is required.', 'warning'); return; }
    if (type !== 'link' && !file)            { _toast('Select a file to upload.', 'warning');  return; }
    if (type !== 'link' && file.size > 25 * 1024 * 1024) {
      _toast('File exceeds the 25 MB limit.', 'warning'); return;
    }

    _uploadBusy = true;
    const btn  = _el('aw-up-btn');
    const prog = _el('aw-up-progress');
    btn.disabled = true;
    if (prog) prog.textContent = type !== 'link' ? 'Uploading file…' : 'Creating record…';

    let fileId   = '';
    let fileName = '';
    let fileSize = 0;

    try {
      // Step 1: upload file to Appwrite Storage (skip for link type)
      if (type !== 'link') {
        if (prog) prog.textContent = 'Uploading file…';
        const uploaded = await _awStor.createFile(AW_BKT_ID, Appwrite.ID.unique(), file);
        fileId   = uploaded.$id;
        fileName = file.name;
        fileSize = file.size;
      }

      // Step 2: create document in Appwrite DB
      if (prog) prog.textContent = 'Creating record…';
      await _awDb.createDocument(AW_DB_ID, AW_COL_ID, Appwrite.ID.unique(), {
        title,
        titleLower:    title.toLowerCase(),
        description:   desc,
        source,
        category,
        tags,
        fileType:      type,
        fileId,
        externalLink:  type === 'link' ? extLink : '',
        fileName,
        fileSize,
        uploadedBy:    'admin',
        uploaderName:  'Admin',
        createdAt:     new Date().toISOString(),
        status,
        reviewNote:    '',
        bookmarkCount: 0,
        viewCount:     0,
        downloadCount: 0,
      });

      _toast('✅ Resource uploaded successfully.', 'success');

      // Reset form
      ['aw-up-title','aw-up-desc','aw-up-source','aw-up-tags'].forEach(function(id) {
        var el = _el(id); if (el) el.value = '';
      });
      if (fileEl) fileEl.value = '';
      if (linkEl) linkEl.value = '';
      if (prog) prog.textContent = '';

      // Refresh both lists
      await _fetchAllResources();
      await _fetchStorageFiles();

    } catch (e) {
      // If DB write failed but file was uploaded, try to clean up the orphan file
      if (fileId) {
        try { await _awStor.deleteFile(AW_BKT_ID, fileId); }
        catch (_) { /* ignore secondary error */ }
      }
      _toast('Upload failed: ' + e.message, 'error');
      if (prog) prog.textContent = '';
    } finally {
      _uploadBusy   = false;
      btn.disabled  = false;
    }
  }

  /** Delete an orphaned file from Appwrite Storage (no linked DB record). */
  async function deleteFileOnly(fileId) {
    if (!_confirm('Delete this file from storage?\nThis cannot be undone.')) return;
    if (!_awStor) return;
    try {
      await _awStor.deleteFile(AW_BKT_ID, fileId);
      _toast('🗑 File deleted from storage.', 'success');
      await _fetchStorageFiles();
    } catch (e) {
      _toast('Delete failed: ' + e.message, 'error');
    }
  }

  /** Delete a file from Appwrite Storage AND its linked DB document. */
  async function deleteFileAndRecord(fileId, docId) {
    if (!_confirm('Delete the file from storage AND remove the linked database record?\nThis cannot be undone.')) return;
    if (!_awDb || !_awStor) return;
    try {
      try { await _awStor.deleteFile(AW_BKT_ID, fileId); }
      catch (se) { console.warn('[LibAdmin] storage delete:', se.message); }
      await _awDb.deleteDocument(AW_DB_ID, AW_COL_ID, docId);
      _toast('🗑 File and record deleted.', 'success');
      await _fetchAllResources();
      await _fetchStorageFiles();
    } catch (e) {
      _toast('Delete failed: ' + e.message, 'error');
    }
  }

  /** Manually refresh the storage files list. */
  async function refreshStorage() {
    await _fetchStorageFiles();
  }

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE — Categories & Tags (taxonomy, admin-only)
  ══════════════════════════════════════════════════════════════ */
  async function _loadCategories() {
    const d = _db(); if (!d) return;
    try {
      const snap = await d.collection(COL_CATS).orderBy('name').get();
      _categories = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
    document.querySelectorAll('.la-sntab').forEach(function(b) {
      b.classList.toggle('active', b.dataset.panel === panel);
    });
    document.querySelectorAll('.la-panel').forEach(function(p) {
      p.classList.toggle('active', p.id === 'la-panel-' + panel);
    });
    if (panel === 'categories') _renderCategoriesPanel();
    if (panel === 'tags')       _renderTagsPanel();
    if (panel === 'storage')    _fetchStorageFiles();
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
  function openEditModal(id) {
    const r = _resources.find(x => x.id === id);
    if (!r) return;
    _editResId = id;

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
    // Storage
    onUploadTypeChange,
    submitAdminUpload,
    deleteFileOnly,
    deleteFileAndRecord,
    refreshStorage,
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
