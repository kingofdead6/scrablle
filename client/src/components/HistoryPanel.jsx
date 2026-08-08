import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import Sheet from './Sheet';

/** The full turn-by-turn log, pushed by the server whenever a turn completes. */
export function useHistory() {
  const [turns, setTurns] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onHistory = (list) => setTurns(Array.isArray(list) ? list : []);
    socket.on('history', onHistory);
    return () => socket.off('history', onHistory);
  }, []);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);
  const clear = useCallback(() => { setTurns([]); setOpen(false); }, []);

  return { turns, open, toggle, close, clear };
}

export function HistoryButton({ count, onClick, className = 'h-9 px-3 text-sm' }) {
  return (
    <button
      onClick={onClick}
      title="Move history"
      aria-label={count > 0 ? `Move history, ${count} turns` : 'Move history'}
      className={`btn btn-ghost ${className}`}
    >
      <span aria-hidden="true">📜</span>
    </button>
  );
}

function Turn({ turn, isMe }) {
  if (turn.type === 'final')
    return (
      <div className="rounded-xl border border-brass/40 bg-brass/10 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brasslight">
          Leftover tiles
        </p>
        <p className="mt-1 text-xs text-mist">
          {turn.wentOut
            ? <><span className="text-ivory">{turn.wentOut}</span> went out and collected everyone else's rack.</>
            : 'Everyone drops the value of the tiles left in hand.'}
        </p>
        <div className="mt-1.5 space-y-0.5">
          {turn.adjustments.map((a) => (
            <p key={a.playerName} className="flex justify-between text-sm">
              <span className="text-ivory">{a.playerName}</span>
              <span>
                <span className={a.delta > 0 ? 'text-sage' : 'text-cinnabar'}>
                  {a.delta > 0 ? '+' : ''}{a.delta}
                </span>
                <span className="ml-2 font-display font-semibold text-brasslight">{a.total}</span>
              </span>
            </p>
          ))}
        </div>
      </div>
    );

  const detail =
    turn.type === 'play' ? null
    : turn.type === 'pass' ? 'passed'
    : turn.type === 'swap' ? `swapped ${turn.count} tile${turn.count === 1 ? '' : 's'}`
    : 'left the game';

  return (
    <div className={`flex gap-2.5 rounded-xl border px-3 py-2 ${
      isMe ? 'border-brass/40 bg-brass/8' : 'border-line bg-panel2/50'
    }`}>
      <span className="w-5 shrink-0 pt-0.5 text-right font-display text-xs text-mist">{turn.n}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-ivory">{turn.playerName}</span>
          {turn.type === 'play' ? (
            <span className="shrink-0 text-sm">
              <span className="font-display font-semibold text-sage">+{turn.score}</span>
              <span className="ml-2 font-display font-semibold text-brasslight">{turn.total}</span>
            </span>
          ) : (
            <span className="shrink-0 font-display text-sm font-semibold text-mist">{turn.total}</span>
          )}
        </p>
        {turn.type === 'play' ? (
          <p className="text-xs leading-relaxed text-mist">
            {turn.words.map((w, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                <span className="font-display font-semibold text-brasslight">{w.word}</span> {w.score}
              </span>
            ))}
            {turn.bingo && <span className="text-sage"> · bingo +50</span>}
          </p>
        ) : (
          <p className="text-xs text-mist">{detail}</p>
        )}
      </div>
    </div>
  );
}

export default function HistoryPanel({ turns, players = [], me, onClose }) {
  const bodyRef = useRef(null);
  const myName = players.find((p) => p.id === me)?.name;

  // Newest turn is the interesting one — open at the bottom.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [turns]);

  const standings = [...players].sort((a, b) => b.score - a.score);

  return (
    <Sheet title="Move history" badge={turns.length ? `${turns.length}` : null} onClose={onClose} bodyRef={bodyRef} bodyClass="space-y-2 px-3 py-3">
      {players.length > 0 && (
        <div className="sticky -top-3 z-10 -mx-3 mb-1 border-b border-line bg-panel px-3 pb-2 pt-1">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {standings.map((p) => (
              <span key={p.id} className="text-xs">
                <span className={p.id === me ? 'text-brasslight' : 'text-mist'}>
                  {p.isBot && '🤖 '}{p.name}
                </span>{' '}
                <span className="font-display text-sm font-semibold text-ivory">{p.score}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {turns.length === 0 ? (
        <p className="pt-6 text-center text-sm text-mist">
          No turns yet. Every play, pass and swap lands here with its score.
        </p>
      ) : (
        turns.map((turn) => (
          <Turn key={turn.n} turn={turn} isMe={!!myName && turn.playerName === myName} />
        ))
      )}
    </Sheet>
  );
}
