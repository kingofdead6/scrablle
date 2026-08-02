import { useEffect, useRef, useState } from 'react';

const CONFETTI_COLORS = ['var(--color-brass)', 'var(--color-sage)', 'var(--color-cinnabar)', 'var(--color-brasslight)', 'var(--color-lagoon)'];

/**
 * Shows what a play just scored: the total, the words behind it, and confetti
 * on a bingo. Returns [burst, showBurst] — feed it the server's move result.
 */
export function useScoreBurst(ms = 2400) {
  const [burst, setBurst] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (result) => {
    if (!result || typeof result.score !== 'number') return;
    setBurst({ ...result, key: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setBurst(null), result.bingo ? ms + 900 : ms);
  };
  return [burst, show];
}

function Confetti() {
  const pieces = useRef(
    Array.from({ length: 22 }, (_, i) => ({
      left: `${6 + (i * 89) % 88}%`,
      dx: `${-70 + ((i * 53) % 140)}px`,
      dy: `${90 + ((i * 37) % 130)}px`,
      rot: `${180 + ((i * 97) % 540)}deg`,
      delay: `${(i % 7) * 55}ms`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    }))
  ).current;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-0">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={{ left: p.left, background: p.color, animationDelay: p.delay, '--dx': p.dx, '--dy': p.dy, '--rot': p.rot }}
        />
      ))}
    </div>
  );
}

export default function ScoreBurst({ burst, label = 'You scored' }) {
  if (!burst) return null;
  return (
    <div key={burst.key} className="pointer-events-none fixed inset-0 z-40 grid place-items-center px-6">
      <div className="burst relative rounded-2xl border border-brass/45 bg-panel/95 px-8 py-6 text-center shadow-[0_20px_60px_rgb(0_0_0/0.5)] backdrop-blur">
        {burst.bingo && <Confetti />}
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-mist">{label}</p>
        <p className="burst-number mt-1 text-6xl sm:text-7xl">+{burst.score}</p>
        {burst.words?.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
            {burst.words.map((w, i) => (
              <span key={i} className="float-away text-sm" style={{ animationDelay: `${120 + i * 90}ms` }}>
                <span className="font-display font-semibold text-ivory">{w.word}</span>
                <span className="text-brasslight"> {w.score}</span>
              </span>
            ))}
          </div>
        )}
        {burst.bingo && (
          <p className="float-away mt-2 font-display text-lg font-semibold text-sage" style={{ animationDelay: '160ms' }}>
            BINGO · all seven tiles · +50
          </p>
        )}
      </div>
    </div>
  );
}
