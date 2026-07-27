import { reactive } from './vue.js';

export const errorLog = reactive({ entries: [] }); // { level, msg, source, ts }

export function logError(level, msg, source) {
  errorLog.entries.unshift({ level, msg: String(msg).slice(0, 300), source: source || '—', ts: Date.now() });
  if (errorLog.entries.length > 200) errorLog.entries.length = 200;
}

export function clearErrorLog() {
  errorLog.entries = [];
}

// Intercept global JS errors — runs once, imported for its side effect in main.js
window.addEventListener('error', e => {
  logError('error', e.message || 'Unknown error', e.filename ? (e.filename.split('/').pop() + ':' + e.lineno) : 'window');
});
window.addEventListener('unhandledrejection', e => {
  logError('error', String(e.reason), 'Promise');
});
const _origErr = console.error.bind(console);
const _origWarn = console.warn.bind(console);
console.error = (...args) => { logError('error', args.map(String).join(' '), 'console'); _origErr(...args); };
console.warn = (...args) => { logError('warn', args.map(String).join(' '), 'console'); _origWarn(...args); };

setTimeout(() => {
  logError('info', 'Admin dashboard initialised', 'app.js');
  logError('info', 'Firestore listeners attached', 'app.js');
}, 500);
