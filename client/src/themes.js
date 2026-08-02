// Board themes. Each id has a matching `html[data-board-theme="…"]` block in
// index.css; the swatch trio is just what the picker shows as a preview.
export const THEMES = [
  { id: 'midnight',  name: 'Midnight Felt', swatch: ['#1c2536', '#7fb7a3', '#e0685c'] },
  { id: 'classic',   name: 'Classic Wood',  swatch: ['#e9dfc7', '#5f9ec4', '#cf5340'] },
  { id: 'emerald',   name: 'Emerald Table', swatch: ['#17453a', '#4f9f7c', '#c9744f'] },
  { id: 'ocean',     name: 'Ocean Deep',    swatch: ['#123244', '#4fb3c4', '#e2795f'] },
  { id: 'noir',      name: 'Noir',          swatch: ['#242424', '#8a8a8a', '#d6d6d6'] },
  { id: 'neon',      name: 'Neon Arcade',   swatch: ['#150d24', '#2ef2d0', '#ff3fa4'] },
  { id: 'parchment', name: 'Parchment',     swatch: ['#f6efdd', '#b98d4d', '#b4402f'] },
  { id: 'sakura',    name: 'Sakura',        swatch: ['#fdeef2', '#e79cb6', '#8d6ca8'] },
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
