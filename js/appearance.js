// ═══════════════════════════════════════════════════════════
// appearance.js — Settings > Appearance engine
// Ported from app.js's APPEARANCE_DEFAULTS / applyAppearance()
// ═══════════════════════════════════════════════════════════
import { reactive } from './vue.js';

const APPEARANCE_DEFAULTS = { theme: 'dark', accent: '#1de9d4', textIntensity: 'normal', textSize: 'm', typeface: 'Barlow', bg: 'none', compact: false };

export const appearance = reactive({ ...APPEARANCE_DEFAULTS });

const THEMES = {
  dark:   { '--bg': '#020510', '--surface': '#080f1e', '--surface2': '#0d1729', '--surface3': '#121f36', '--border': 'rgba(255,255,255,0.07)', '--border2': 'rgba(255,255,255,0.12)', '--text': '#c8d8f0', '--text-dim': '#6b82a0', '--text-muted': '#3d5070' },
  light:  { '--bg': '#edf2f9', '--surface': '#ffffff', '--surface2': '#f4f7fb', '--surface3': '#e8eef6', '--border': 'rgba(0,0,0,0.08)', '--border2': 'rgba(0,0,0,0.15)', '--text': '#1a2a44', '--text-dim': '#4a6080', '--text-muted': '#8090a8' },
  amoled: { '--bg': '#000000', '--surface': '#080808', '--surface2': '#101010', '--surface3': '#181818', '--border': 'rgba(255,255,255,0.06)', '--border2': 'rgba(255,255,255,0.10)', '--text': '#e0eeff', '--text-dim': '#6080a0', '--text-muted': '#304050' },
  hc:     { '--bg': '#000000', '--surface': '#0c0c0c', '--surface2': '#161616', '--surface3': '#202020', '--border': 'rgba(255,255,255,0.35)', '--border2': 'rgba(255,255,255,0.65)', '--text': '#ffffff', '--text-dim': '#dddddd', '--text-muted': '#aaaaaa' },
};
const TEXT_INTENSITY_VARS = {
  soft: { '--text': '#8098b8', '--text-dim': '#4a6070', '--text-muted': '#283840' },
  normal: null,
  strong: { '--text': '#e8f4ff', '--text-dim': '#b0cce8', '--text-muted': '#6088a8' },
};
const TEXT_SCALE = { s: '0.875', m: '1', l: '1.125', xl: '1.25' };

const SVG = {
  circuit: `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><path d='M20 60 H50 M70 60 H100 M60 20 V50 M60 70 V100 M20 20 H40 V40 M80 20 H100 V40 M20 80 H40 V100 M80 80 H100 V100' stroke='rgba(29,233,212,0.12)' stroke-width='1' fill='none'/><circle cx='60' cy='60' r='5' fill='none' stroke='rgba(29,233,212,0.18)' stroke-width='1'/><circle cx='50' cy='60' r='2.5' fill='rgba(29,233,212,0.22)'/><circle cx='70' cy='60' r='2.5' fill='rgba(29,233,212,0.22)'/><circle cx='60' cy='50' r='2.5' fill='rgba(29,233,212,0.22)'/><circle cx='60' cy='70' r='2.5' fill='rgba(29,233,212,0.22)'/><circle cx='40' cy='40' r='2' fill='rgba(29,233,212,0.15)'/><circle cx='80' cy='40' r='2' fill='rgba(29,233,212,0.15)'/><circle cx='40' cy='80' r='2' fill='rgba(29,233,212,0.15)'/><circle cx='80' cy='80' r='2' fill='rgba(29,233,212,0.15)'/></svg>`,
  topo: `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><ellipse cx='100' cy='100' rx='90' ry='70' fill='none' stroke='rgba(29,233,212,0.07)' stroke-width='1'/><ellipse cx='100' cy='100' rx='70' ry='52' fill='none' stroke='rgba(29,233,212,0.09)' stroke-width='1'/><ellipse cx='100' cy='100' rx='50' ry='36' fill='none' stroke='rgba(29,233,212,0.11)' stroke-width='1'/><ellipse cx='100' cy='100' rx='30' ry='20' fill='none' stroke='rgba(29,233,212,0.14)' stroke-width='1'/><ellipse cx='100' cy='100' rx='12' ry='7' fill='none' stroke='rgba(29,233,212,0.18)' stroke-width='1'/><ellipse cx='40' cy='150' rx='35' ry='25' fill='none' stroke='rgba(29,233,212,0.06)' stroke-width='1'/><ellipse cx='40' cy='150' rx='20' ry='14' fill='none' stroke='rgba(29,233,212,0.09)' stroke-width='1'/><ellipse cx='160' cy='50' rx='30' ry='20' fill='none' stroke='rgba(29,233,212,0.06)' stroke-width='1'/><ellipse cx='160' cy='50' rx='16' ry='10' fill='none' stroke='rgba(29,233,212,0.09)' stroke-width='1'/></svg>`,
  forest: `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><path d='M40 72 L40 50 M40 50 C40 38 20 32 22 18 C24 8 36 4 40 10 C44 4 56 8 58 18 C60 32 40 38 40 50Z' fill='none' stroke='rgba(52,211,153,0.14)' stroke-width='1' stroke-linejoin='round'/><path d='M15 72 L15 58 M15 58 C15 50 4 46 5 37 C6 30 12 28 15 32 C18 28 24 30 25 37 C26 46 15 50 15 58Z' fill='none' stroke='rgba(52,211,153,0.09)' stroke-width='1' stroke-linejoin='round'/><path d='M65 72 L65 60 M65 60 C65 53 56 50 57 43 C58 37 63 35 65 39 C67 35 72 37 73 43 C74 50 65 53 65 60Z' fill='none' stroke='rgba(52,211,153,0.09)' stroke-width='1' stroke-linejoin='round'/></svg>`,
  linen: `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><line x1='0' y1='24' x2='24' y2='0' stroke='rgba(200,216,240,0.05)' stroke-width='0.6'/><line x1='-6' y1='6' x2='6' y2='-6' stroke='rgba(200,216,240,0.04)' stroke-width='0.6'/><line x1='18' y1='30' x2='30' y2='18' stroke='rgba(200,216,240,0.04)' stroke-width='0.6'/><line x1='0' y1='0' x2='24' y2='24' stroke='rgba(200,216,240,0.03)' stroke-width='0.5'/></svg>`,
};
function svgUrl(key) { return `url("data:image/svg+xml,${encodeURIComponent(SVG[key])}")`; }

export const BG_PATTERNS = {
  none: { image: 'none' },
  grid: { image: `linear-gradient(rgba(29,233,212,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(29,233,212,0.05) 1px,transparent 1px)`, size: '32px 32px' },
  dots: { image: `radial-gradient(circle, rgba(29,233,212,0.22) 1px, transparent 1px)`, size: '20px 20px' },
  lines: { image: `repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(29,233,212,0.05) 32px)` },
  circuit: { image: svgUrl('circuit'), size: '120px 120px' },
  blueprint: { image: `linear-gradient(rgba(96,165,250,0.10) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,0.10) 1px,transparent 1px),linear-gradient(rgba(96,165,250,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,0.04) 1px,transparent 1px)`, size: '80px 80px, 80px 80px, 20px 20px, 20px 20px' },
  aurora: { aurora: true },
  midnight: { image: `radial-gradient(circle, rgba(255,255,255,0.28) 1px, transparent 1px), radial-gradient(circle, rgba(255,255,255,0.14) 1px, transparent 1px)`, size: '90px 90px, 50px 50px', pos: '0 0, 45px 25px' },
  forest: { image: svgUrl('forest'), size: '80px 80px' },
  ember: { image: `radial-gradient(ellipse 60% 55% at 30% 60%, rgba(249,115,22,0.09), transparent 65%), radial-gradient(ellipse 50% 60% at 75% 35%, rgba(251,113,133,0.07), transparent 60%), radial-gradient(ellipse 40% 40% at 55% 80%, rgba(240,180,41,0.05), transparent 55%)` },
  topo: { image: svgUrl('topo'), size: '200px 200px' },
  linen: { image: svgUrl('linen'), size: '24px 24px' },
};

export const BG_PREVIEWS = {
  grid: { bg: '#020510', overlay: `linear-gradient(rgba(29,233,212,0.12) 1px,transparent 1px),linear-gradient(90deg,rgba(29,233,212,0.12) 1px,transparent 1px)`, size: '10px 10px' },
  dots: { bg: '#020510', overlay: `radial-gradient(circle, rgba(29,233,212,0.5) 1px, transparent 1px)`, size: '7px 7px' },
  lines: { bg: '#020510', overlay: `repeating-linear-gradient(0deg,transparent,transparent 9px,rgba(29,233,212,0.14) 10px)` },
  circuit: { bg: '#020510', overlay: svgUrl('circuit'), size: '60px 60px' },
  blueprint: { bg: '#030a18', overlay: `linear-gradient(rgba(96,165,250,0.22) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,0.22) 1px,transparent 1px),linear-gradient(rgba(96,165,250,0.08) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,0.08) 1px,transparent 1px)`, size: '20px 20px,20px 20px,5px 5px,5px 5px' },
  midnight: { bg: '#000510', overlay: `radial-gradient(circle, rgba(255,255,255,0.55) 1px, transparent 1px), radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)`, size: '22px 22px, 13px 13px', pos: '0 0, 11px 7px' },
  forest: { bg: '#030d08', overlay: svgUrl('forest'), size: '40px 40px' },
  topo: { bg: '#020510', overlay: svgUrl('topo'), size: '100px 100px' },
  linen: { bg: '#050a14', overlay: svgUrl('linen'), size: '12px 12px' },
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function applyAppearance() {
  const root = document.documentElement;
  const { theme, accent, textIntensity, textSize, typeface, bg, compact } = appearance;

  const resolvedTheme = theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  const vars = THEMES[resolvedTheme] || THEMES.dark;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  root.style.setProperty('--teal', accent);
  const [r, g, b] = hexToRgb(accent);
  root.style.setProperty('--accent-rgb', `${r},${g},${b}`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', accent);

  const ti = TEXT_INTENSITY_VARS[textIntensity];
  if (ti) Object.entries(ti).forEach(([k, v]) => root.style.setProperty(k, v));

  const scale = TEXT_SCALE[textSize] || '1';
  document.body.style.fontSize = (parseFloat(scale) * 14) + 'px';

  root.style.setProperty('--sans', `'${typeface}', sans-serif`);
  document.body.style.fontFamily = `'${typeface}', sans-serif`;

  document.body.className = document.body.className.replace(/\bbg-\S+/g, '').trim();
  if (bg === 'aurora') {
    document.body.classList.add('bg-aurora');
    root.style.setProperty('--bg-pattern', 'none');
  } else {
    const pat = BG_PATTERNS[bg] || BG_PATTERNS.none;
    root.style.setProperty('--bg-pattern', pat.image || 'none');
    root.style.setProperty('--bg-pattern-size', pat.size || 'auto');
    root.style.setProperty('--bg-pattern-pos', pat.pos || '0 0');
  }

  document.body.classList.toggle('compact', !!compact);
  return resolvedTheme;
}

function saveAppearance() {
  try { localStorage.setItem('nt_admin_appearance', JSON.stringify(appearance)); } catch (e) {}
}

export function loadAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem('nt_admin_appearance') || 'null');
    if (saved) Object.assign(appearance, APPEARANCE_DEFAULTS, saved);
  } catch (e) {}
  applyAppearance();
}

export function setSetting(key, val) {
  appearance[key] = val;
  applyAppearance();
  saveAppearance();
}

// Apply saved preferences immediately on module load (before login even)
loadAppearance();
