// ═══════════════════════════════════════════════════════════
// fooddb.js — Packaged Food DB store (Chakudya API)
// Ported from the FoodDB module in app.js
// ═══════════════════════════════════════════════════════════
import { reactive } from './vue.js';

const MALAWI_API = 'https://chakudya-api.edisontaimu9.workers.dev';

export const fooddb = reactive({ docs: [], loaded: false });

function getAdminKey() {
  let key = localStorage.getItem('chakudya_admin_key');
  if (!key) {
    key = prompt('Enter the Chakudya API admin key (saved locally on this device only):');
    if (key) localStorage.setItem('chakudya_admin_key', key.trim());
  }
  return (key || '').trim();
}
function adminHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminKey() };
}

export async function initFoodDB() {
  try {
    const res = await fetch(MALAWI_API + '/packaged?limit=100', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('API ' + res.status);
    const json = await res.json();
    fooddb.docs = (Array.isArray(json) ? json : json.data || []).map(r => ({
      id: String(r.id), name: r.product_name, brand: r.brand || null, barcode: r.barcode || null,
      category: r.category || 'Packaged', country: r.country || 'MW',
      servingSize: r.serving_size_g ?? null, servingLabel: r.serving_label || null,
      image: r.image || null, verified: r.status === 'approved', submittedBy: r.submitted_by || null,
      nameLower: (r.product_name || '').toLowerCase(),
      per100g: { kcal: r.energy_kcal ?? null, kj: r.energy_kj ?? null, pro: r.protein_g ?? null, cho: r.carbs_g ?? null, fat: r.fat_g ?? null, fiber: r.fiber_g ?? null, sugar: r.sugar_g ?? null, sodium: r.sodium_mg ?? null },
    }));
    fooddb.loaded = true;
  } catch (e) {
    console.error('[FoodDB] init fetch:', e);
    throw e;
  }
}

export async function verifyEntry(id) {
  const res = await fetch(MALAWI_API + '/packaged/' + id, {
    method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ status: 'approved' }), signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) { let m = 'API error ' + res.status; try { const b = await res.json(); m = b.message || b.error || m; } catch (_) {} throw new Error(m); }
  const d = fooddb.docs.find(x => x.id === id);
  if (d) d.verified = true;
}

export async function rejectEntry(id) {
  const res = await fetch(MALAWI_API + '/packaged/' + id, { method: 'DELETE', headers: adminHeaders(), signal: AbortSignal.timeout(10000) });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Delete failed'); }
  fooddb.docs = fooddb.docs.filter(x => x.id !== id);
}

export async function deleteEntry(id) {
  const res = await fetch(MALAWI_API + '/packaged/' + id, { method: 'DELETE', headers: adminHeaders(), signal: AbortSignal.timeout(10000) });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Delete failed'); }
  fooddb.docs = fooddb.docs.filter(x => x.id !== id);
}

export function validateEntry(d) {
  if (!d.name) return 'Product name is required.';
  const n = d.per100g;
  if (n.kcal == null) return 'Energy (kcal) is required.';
  if (n.pro == null) return 'Protein (g) is required.';
  if (n.cho == null) return 'Carbohydrate (g) is required.';
  if (n.fat == null) return 'Fat (g) is required.';
  if (d.barcode && !/^\d{8,14}$/.test(d.barcode)) return 'Barcode must be 8–14 digits.';
  return null;
}

export async function saveEntry(data, editId) {
  const n = data.per100g || {};
  const payload = {
    product_name: data.name, brand: data.brand || null, barcode: data.barcode || null,
    serving_size_g: data.servingSize ?? 100, energy_kcal: n.kcal ?? null, protein_g: n.pro ?? null,
    carbs_g: n.cho ?? null, fat_g: n.fat ?? null, fiber_g: n.fiber ?? null, sugar_g: n.sugar ?? null,
    sodium_mg: n.sodium ?? null, status: data.verified ? 'approved' : 'pending',
  };

  if (editId) {
    const res = await fetch(MALAWI_API + '/packaged/' + editId, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(payload), signal: AbortSignal.timeout(12000) });
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Update failed'); }
    const idx = fooddb.docs.findIndex(x => x.id === editId);
    if (idx !== -1) fooddb.docs[idx] = { ...fooddb.docs[idx], ...data, id: editId };
    return { approved: data.verified };
  } else {
    const res = await fetch(MALAWI_API + '/packaged/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12000) });
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Add failed'); }
    const saved = await res.json();
    const newId = saved?.data?.id != null ? String(saved.data.id) : null;
    let approved = false;
    if (newId && data.verified) {
      const approveRes = await fetch(MALAWI_API + '/packaged/' + newId, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ status: 'approved' }), signal: AbortSignal.timeout(12000) });
      approved = approveRes.ok;
    }
    fooddb.docs.unshift({ ...data, id: newId || String(Date.now()), verified: approved });
    return { approved };
  }
}

/* ── Quick-import via Open Food Facts ── */
const CAT_MAP_KEYWORDS = [
  [/maize|rice|flour|bread|cereal/i, 'Staples'], [/bean|lentil|pea|soy/i, 'Legumes'],
  [/meat|fish|egg|chicken|beef/i, 'Protein Foods'], [/vegetable|veg\b/i, 'Vegetables'],
  [/fruit/i, 'Fruits'], [/milk|cheese|yog/i, 'Dairy'], [/oil|fat|butter|margarine/i, 'Fats & Oils'],
  [/juice|drink|soda|water|tea|coffee/i, 'Beverages'], [/sauce|ketchup|mayo|spice/i, 'Condiments'],
  [/snack|chip|biscuit|crisp/i, 'Snacks'], [/formula|infant/i, 'Infant Formula'],
];

export function guessCategory(offCategories) {
  const text = (offCategories || '').toLowerCase();
  for (const [re, cat] of CAT_MAP_KEYWORDS) if (re.test(text)) return cat;
  return 'Packaged';
}

export async function lookupBarcode(bc) {
  if (fooddb.docs.some(x => x.barcode === bc)) return { exists: true };
  const res = await fetch('https://world.openfoodfacts.org/api/v0/product/' + bc + '.json', { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  if (json.status !== 1 || !json.product) return { notFound: true };

  const p = json.product;
  const n = p.nutriments || {};
  const get = (...keys) => { for (const k of keys) { if (n[k] != null) return +n[k]; } return null; };

  return {
    prefill: {
      name: p.product_name_en || p.product_name || p.product_name_fr || '',
      brand: p.brands || '', barcode: bc, image: p.image_url || '',
      category: guessCategory(p.categories),
      kcal: get('energy-kcal_100g', 'energy-kcal'),
      pro: get('proteins_100g', 'proteins'), cho: get('carbohydrates_100g', 'carbohydrates'),
      fat: get('fat_100g', 'fat'), fiber: get('fiber_100g', 'fiber'), sugar: get('sugars_100g', 'sugars'),
      sodium: get('sodium_100g', 'sodium'),
    },
  };
}
