// Shared helpers ported from app.js — timestamps, device labels, Chart.js defaults.
export const TODAY = new Date().toISOString().slice(0, 10);

export const CHART_COLORS = ['#1de9d4', '#f0b429', '#60a5fa', '#34d399', '#a78bfa', '#fb7185', '#fbbf24', '#38bdf8'];
export const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#6b82a0', font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 10 } },
    tooltip: { backgroundColor: '#080f1e', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, titleColor: '#c8d8f0', bodyColor: '#6b82a0', titleFont: { family: 'JetBrains Mono' }, bodyFont: { family: 'JetBrains Mono', size: 10 } },
  },
};

/** Build (or replace) a Chart.js instance on a <canvas> element. */
export function makeChart(canvas, cfg) {
  if (!canvas) return null;
  if (canvas._chartInstance) { canvas._chartInstance.destroy(); }
  canvas._chartInstance = new Chart(canvas, cfg);
  return canvas._chartInstance;
}

export function destroyChart(canvas) {
  if (canvas?._chartInstance) { canvas._chartInstance.destroy(); canvas._chartInstance = null; }
}

/** Resolve a Firestore doc's primary timestamp field to a JS Date. */
export function ts(doc) {
  const t = doc.startedAt || doc.timestamp || doc.sentAt || doc.lastSeen || doc.createdAt;
  if (!t) return new Date(0);
  return t.toDate ? t.toDate() : new Date(t);
}

export function fmtTs(tsVal) {
  if (!tsVal) return '—';
  const d = tsVal.toDate ? tsVal.toDate() : new Date(tsVal);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
       + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function ago(tsVal) {
  if (!tsVal) return '—';
  const d = tsVal.toDate ? tsVal.toDate() : new Date(tsVal);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 30) return 'Just now';
  if (s < 120) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  return h + 'h ago';
}

export function deviceIcon(ua) {
  if (!ua) return '❓';
  const u = ua.toLowerCase();
  if (/ipad|tablet/.test(u)) return '📲';
  if (/mobile|android|iphone/.test(u)) return '📱';
  return '🖥';
}

export function deviceLabel(ua) {
  if (!ua) return 'Unknown';
  const u = ua.toLowerCase();
  if (/ipad|tablet/.test(u)) return 'Tablet';
  if (/android/.test(u)) return 'Android';
  if (/iphone/.test(u)) return 'iOS';
  if (/firefox/.test(u)) return 'Desktop · Firefox';
  if (/edg/.test(u)) return 'Desktop · Edge';
  if (/chrome/.test(u)) return 'Desktop · Chrome';
  if (/safari/.test(u)) return 'Desktop · Safari';
  return 'Desktop';
}

/** Presence-derived "how many active in the last N" counts, shared by
 *  the Home badges, Analytics KPIs, and (later) the Online tab. */
export function presenceCounts(allPresence) {
  const now = Date.now();
  const within = (ms) => allPresence.filter(p => {
    const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
    return (now - ls) < ms;
  }).length;
  return {
    now:  within(120_000),
    m30:  within(1_800_000),
    m60:  within(3_600_000),
    h24:  within(86_400_000),
  };
}

export function downloadCSV(filename, headers, rows) {
  const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
/** Rows for the "Live Users" table — presence updated in the last 5 min. */
export function liveUserRows(allPresence) {
  const now = Date.now();
  return allPresence
    .filter(p => { const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0; return (now - ls) < 300_000; })
    .sort((a, b) => {
      const tA = a.lastSeen?.toDate ? a.lastSeen.toDate().getTime() : 0;
      const tB = b.lastSeen?.toDate ? b.lastSeen.toDate().getTime() : 0;
      return tB - tA;
    })
    .map(p => {
      const ls = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
      return { ...p, isLive: (now - ls) < 90_000 };
    });
}
