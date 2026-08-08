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

function ThemeGrid({ themes, theme, onPick }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {themes.map((t) => (
        <button
          key={t.id}
          onClick={() => onPick(t.id)}
          className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-left transition ${
            theme === t.id ? 'border-brass bg-brass/12' : 'border-line bg-panel2/50 hover:border-brass/50'
          }`}
        >
          <span className="flex shrink-0 gap-0.5">
            {t.swatch.map((color) => (
              <span key={color} className="h-7 w-2.5 rounded-sm" style={{ background: color }} />
            ))}
          </span>
          {/* Names wrap rather than truncate — two columns stay readable on a phone. */}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-tight text-ivory">{t.name}</span>
            {theme === t.id && <span className="block text-xs text-brasslight">In use</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function ThemeSheet({ theme, onPick, onClose }) {
  const dark = THEMES.filter((t) => t.mode === 'dark');
  const light = THEMES.filter((t) => t.mode === 'light');
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/70 p-4 sm:place-items-center" onClick={onClose}>
      <div
        className="burst card flex max-h-[85dvh] w-full max-w-md flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-ivory">Board theme</h3>
          <button onClick={onClose} className="btn btn-ghost h-8 px-3 text-sm">Done</button>
        </div>
        <div className="-mr-2 mt-3 space-y-4 overflow-y-auto pr-2">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-mist">Dark</p>
            <ThemeGrid themes={dark} theme={theme} onPick={onPick} />
          </section>
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-mist">Light</p>
            <ThemeGrid themes={light} theme={theme} onPick={onPick} />
          </section>
        </div>
      </div>
    </div>
  );
}
