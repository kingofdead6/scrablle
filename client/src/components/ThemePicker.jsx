import { useEffect, useState } from 'react';
import { THEMES, applyTheme, loadTheme } from '../themes';

/** Applies the saved theme on mount and exposes [current, setTheme]. */
export function useTheme() {
  const [theme, setTheme] = useState(loadTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  return [theme, setTheme];
}

export function ThemeButton({ onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      title="Board theme"
      aria-label="Board theme"
      className={`btn btn-ghost ${className}`}
    >
      <span aria-hidden="true">🎨</span>
    </button>
  );
}

export default function ThemeSheet({ theme, onPick, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/70 p-4 sm:place-items-center" onClick={onClose}>
      <div className="burst card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-ivory">Board theme</h3>
          <button onClick={onClose} className="btn btn-ghost h-8 px-3 text-sm">Done</button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                theme === t.id ? 'border-brass bg-brass/12' : 'border-line bg-panel2/50 hover:border-brass/50'
              }`}
            >
              <span className="flex shrink-0 gap-1">
                {t.swatch.map((color) => (
                  <span key={color} className="h-6 w-3 rounded-sm" style={{ background: color }} />
                ))}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ivory">{t.name}</span>
                {theme === t.id && <span className="block text-xs text-brasslight">In use</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
