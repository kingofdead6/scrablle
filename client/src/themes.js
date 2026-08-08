// Board themes. Each id has a matching `html[data-board-theme="…"]` block in
// index.css; the swatch trio is just what the picker shows as a preview, and
// `mode` groups the list so light themes don't surprise anyone at night.
export const THEMES = [
  { id: 'midnight',  name: 'Midnight Felt', mode: 'dark',  swatch: ['#1c2536', '#7fb7a3', '#e0685c'] },
  { id: 'classic',   name: 'Classic Wood',  mode: 'dark',  swatch: ['#e9dfc7', '#5f9ec4', '#cf5340'] },
  { id: 'emerald',   name: 'Emerald Table', mode: 'dark',  swatch: ['#17453a', '#4f9f7c', '#c9744f'] },
  { id: 'ocean',     name: 'Ocean Deep',    mode: 'dark',  swatch: ['#123244', '#4fb3c4', '#e2795f'] },
  { id: 'noir',      name: 'Noir',          mode: 'dark',  swatch: ['#242424', '#8a8a8a', '#d6d6d6'] },
  { id: 'neon',      name: 'Neon Arcade',   mode: 'dark',  swatch: ['#150d24', '#2ef2d0', '#ff3fa4'] },
  { id: 'ruby',      name: 'Ruby Velvet',   mode: 'dark',  swatch: ['#3a1220', '#d98b6a', '#e0a33f'] },
  { id: 'slate',     name: 'Slate & Copper', mode: 'dark', swatch: ['#2b3138', '#5f8ea0', '#c97f4e'] },
  { id: 'autumn',    name: 'Autumn Oak',    mode: 'dark',  swatch: ['#33251a', '#8a9a52', '#c9552f'] },
  { id: 'lavender',  name: 'Lavender Dusk', mode: 'dark',  swatch: ['#241d3d', '#9b8ede', '#e07fa8'] },
  { id: 'carbon',    name: 'Carbon & Lime', mode: 'dark',  swatch: ['#1a1c1a', '#a8e05f', '#5fd0e0'] },
  { id: 'parchment', name: 'Parchment',     mode: 'light', swatch: ['#f6efdd', '#b98d4d', '#b4402f'] },
  { id: 'sakura',    name: 'Sakura',        mode: 'light', swatch: ['#fdeef2', '#e79cb6', '#8d6ca8'] },
  { id: 'arctic',    name: 'Arctic',        mode: 'light', swatch: ['#eef5fa', '#7fb0cc', '#4a7d99'] },
  { id: 'sand',      name: 'Desert Sand',   mode: 'light', swatch: ['#f7eddc', '#d9a066', '#a8583c'] },
  { id: 'mint',      name: 'Mint Cream',    mode: 'light', swatch: ['#eef7f0', '#7fbf9a', '#4e8f73'] },
];

const KEY = 'scrabble-live-theme';
export const DEFAULT_THEME = 'midnight';

export function loadTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    return THEMES.some((t) => t.id === saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(id) {
  document.documentElement.dataset.boardTheme = id;
  try { localStorage.setItem(KEY, id); } catch { /* private mode — theme just won't stick */ }
}
