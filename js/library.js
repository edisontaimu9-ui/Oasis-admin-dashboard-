// ═══════════════════════════════════════════════════════════
// library.js — Oasis Library Moderation store
// Resources backend: Appwrite Databases + Storage
// Taxonomy (categories/tags): Firebase Firestore
// Ported from library_admin.js
// ═══════════════════════════════════════════════════════════
import { reactive } from './vue.js';

const AW_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
const AW_PROJECT  = '6a25de8d000c21cbdbba';
const AW_DB_ID    = '6a25e03b0031c4391fa4';
const AW_BKT_ID   = '6a25df33001285e51ee6';
const AW_COL_ID   = 'library-resources';
const COL_CATS    = 'library_categories';
const COL_TAGS    = 'library_tags';

const DEFAULT_CATEGORIES = [
  { id: 'clinical_guidelines',          name: 'Clinical Guidelines' },
  { id: 'research_articles',            name: 'Research Articles' },
  { id: 'protocols_sops',               name: 'Protocols & SOPs' },
  { id: 'patient_education',            name: 'Patient Education' },
  { id: 'reference_tables_charts',      name: 'Reference Tables & Charts' },
  { id: 'assessment_tools',             name: 'Assessment Tools' },
  { id: 'enteral_parenteral_nutrition', name: 'Enteral & Parenteral Nutrition' },
  { id: 'pediatric_nutrition',          name: 'Pediatric Nutrition' },
  { id: 'disease_specific_nutrition',   name: 'Disease-Specific Nutrition' },
  { id: 'malawi_sub_saharan_africa',    name: 'Malawi / Sub-Saharan Africa' },
  { id: 'textbooks_manuals',            name: 'Textbooks & Manuals' },
  { id: 'other',                        name: 'Other' },
];

let awClient = null, awDb = null, awStor = null, unsubRes = null, initialized = false;

export const lib = reactive({
  resources: [],
  categories: [],
  tags: [],
  ready: false,
});

function normDoc(doc) {
  return {
    id: doc.$id,
    title: doc.title || '', description: doc.description || '',
    category: doc.category || '', tags: doc.tags || [],
    source: doc.source || '', fileType: doc.fileType || '',
    fileId: doc.fileId || '', externalLink: doc.externalLink || '',
    fileName: doc.fileName || '', fileSize: doc.fileSize || 0,
    uploadedBy: doc.uploadedBy || '', uploaderName: doc.uploaderName || '',
    uploadedAt: doc.createdAt || '', status: doc.status || 'pending',
    reviewNote: doc.reviewNote || '',
  };
}

function fdb() { return firebase.apps.length ? firebase.firestore() : null; }

async function signInAnon() {
  try { const auth = firebase.auth(); if (!auth.currentUser) await auth.signInAnonymously(); }
  catch (e) { console.warn('[Library] anon auth:', e.message); }
}

export function initLibrary() {
  if (initialized) return;
  initialized = true;
  if (typeof Appwrite === 'undefined' || !Appwrite.Client) {
    console.error('[Library] Appwrite SDK not loaded.');
    return;
  }
  awClient = new Appwrite.Client().setEndpoint(AW_ENDPOINT).setProject(AW_PROJECT);
  awDb = new Appwrite.Databases(awClient);
  awStor = new Appwrite.Storage(awClient);

  fetchAllResources();
  const channel = 'databases.' + AW_DB_ID + '.collections.' + AW_COL_ID + '.documents';
  unsubRes = awClient.subscribe(channel, () => fetchAllResources());

  // Firebase-side taxonomy needs anon auth (admin is already signed in with
  // a real account, but the underlying rules were written for anon+admin)
  loadCategories();
  loadTags();
  lib.ready = true;
}

async function fetchAllResources() {
  if (!awDb) return;
  try {
    const resp = await awDb.listDocuments(AW_DB_ID, AW_COL_ID, [
      Appwrite.Query.orderDesc('createdAt'), Appwrite.Query.limit(300),
    ]);
    lib.resources = resp.documents.map(normDoc);
  } catch (e) { console.error('[Library] fetchAllResources:', e); }
}

/* ── Categories ── */
async function seedDefaultCategories(d) {
  const batch = d.batch();
  DEFAULT_CATEGORIES.forEach(cat => {
    batch.set(d.collection(COL_CATS).doc(cat.id), { id: cat.id, name: cat.name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  });
  await batch.commit();
}

export async function loadCategories() {
  const d = fdb(); if (!d) return;
  try {
    let snap = await d.collection(COL_CATS).orderBy('name').get();
    if (snap.empty) { await seedDefaultCategories(d); snap = await d.collection(COL_CATS).orderBy('name').get(); }
    lib.categories = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) { console.error('[Library] load categories:', e); }
}

export async function loadTags() {
  const d = fdb(); if (!d) return;
  try {
    const snap = await d.collection(COL_TAGS).orderBy('name').get();
    lib.tags = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) { console.error('[Library] load tags:', e); }
}

export function catName(catId) {
  const f = lib.categories.find(c => c.id === catId);
  return f ? f.name : (catId || '—');
}

/* ── Resource moderation ── */
export async function reviewResource(id, action, note) {
  await awDb.updateDocument(AW_DB_ID, AW_COL_ID, id, { status: action === 'approve' ? 'approved' : 'rejected', reviewNote: note || '' });
}

export async function editResource(id, fields) {
  await awDb.updateDocument(AW_DB_ID, AW_COL_ID, id, {
    title: fields.title, titleLower: fields.title.toLowerCase(), description: fields.description,
    source: fields.source, category: fields.category, tags: fields.tags, status: fields.status,
  });
}

export async function deleteResource(r) {
  if (r.fileId && awStor) { try { await awStor.deleteFile(AW_BKT_ID, r.fileId); } catch (e) { console.warn('[Library] storage delete skipped:', e.message); } }
  await awDb.deleteDocument(AW_DB_ID, AW_COL_ID, r.id);
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

export function detectFileType(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const map = { pdf: 'PDF', doc: 'DOCX', docx: 'DOCX', ppt: 'PPTX', pptx: 'PPTX', xls: 'XLSX', xlsx: 'XLSX', csv: 'XLSX', zip: 'ZIP', rar: 'ZIP', '7z': 'ZIP', jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', svg: 'Image', webp: 'Image', mp4: 'Video', mov: 'Video' };
  return map[ext] || ext.toUpperCase() || 'File';
}

export function fileTypeIcon(type) {
  return { PDF: '📄', DOCX: '📝', PPTX: '📊', XLSX: '📈', ZIP: '🗜', Image: '🖼', Video: '🎬' }[type] || '📎';
}

export async function uploadResource(file, meta, onProgress) {
  const fileType = detectFileType(file);
  const totalSize = file.size;
  const fileResp = await awStor.createFile(AW_BKT_ID, Appwrite.ID.unique(), file, [], (progress) => {
    onProgress?.(Math.min(100, Math.round(progress.progress || 0)), progress.sizeUploaded || 0, totalSize);
  });
  const storageUrl = `${AW_ENDPOINT}/storage/buckets/${AW_BKT_ID}/files/${fileResp.$id}/view?project=${AW_PROJECT}`;
  const fbUser = firebase.auth?.().currentUser;
  await awDb.createDocument(AW_DB_ID, AW_COL_ID, Appwrite.ID.unique(), {
    title: meta.title, titleLower: meta.title.toLowerCase(), description: meta.description,
    source: meta.source || 'Admin Upload', category: meta.category, tags: meta.tags,
    fileType, fileId: fileResp.$id, fileName: file.name, fileSize: totalSize,
    externalLink: storageUrl, uploadedBy: fbUser?.uid || 'admin', uploaderName: fbUser?.displayName || fbUser?.email || 'Admin',
    status: 'approved', createdAt: new Date().toISOString(), reviewNote: '',
    bookmarkCount: 0, viewCount: 0, downloadCount: 0,
  });
}

/* ── Categories CRUD ── */
export async function addCategory(name, id) {
  const d = fdb(); if (!d) return;
  await d.collection(COL_CATS).doc(id).set({ name, id, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  await loadCategories();
}
export async function saveCategory(id, name) {
  const d = fdb(); if (!d) return;
  await d.collection(COL_CATS).doc(id).update({ name });
  await loadCategories();
}
export async function deleteCategory(id) {
  const d = fdb(); if (!d) return;
  await d.collection(COL_CATS).doc(id).delete();
  await loadCategories();
}

/* ── Tags CRUD ── */
export async function addTag(name) {
  const d = fdb(); if (!d) return;
  await d.collection(COL_TAGS).add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  await loadTags();
}
export async function saveTag(id, name) {
  const d = fdb(); if (!d) return;
  await d.collection(COL_TAGS).doc(id).update({ name });
  await loadTags();
}
export async function deleteTag(id) {
  const d = fdb(); if (!d) return;
  await d.collection(COL_TAGS).doc(id).delete();
  await loadTags();
}
