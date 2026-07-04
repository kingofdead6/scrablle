import { socket } from '../socket';
import Board from './Board';
import { Toast, useToast } from './Toast';
import { useCountdown } from '../useCountdown';

function CodeTile({ ch }) {
  return (
    <span className="relative inline-grid h-20 w-[4.5rem] place-items-center rounded-xl bg-gradient-to-br from-ivory to-ivorydeep text-tiletext shadow-[0_5px_0_#b99f6e,0_12px_26px_rgb(0_0_0/0.45)] sm:h-24 sm:w-[5.25rem]">
      <span className="font-display text-5xl font-bold sm:text-6xl">{ch}</span>
    </span>
  );
}

function Header({ code, onLeave }) {
  return (
    <header className="flex items-center justify-between">
      <span className="font-display text-lg font-semibold text-ivory">Scrabble Live</span>
      <div className="flex items-center gap-3">
        {code && (
          <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-display text-sm font-semibold tracking-[0.3em] text-brasslight">
            {code}
          </span>
        )}
        <button onClick={onLeave} className="btn btn-ghost h-9 px-3 text-sm">Close room</button>
      </div>
    </header>
  );
}

function PlayerRail({ state, remaining }) {
  return (
    <div className="card space-y-2 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-mist">Players</h3>
      {state.players.map((p, i) => {
        const active = state.status === 'playing' && state.turn === i;
        const urgent = active && remaining !== null && remaining <= 10;
        return (
          <div
            key={p.id}
            className={`flex items-center justify-between rounded-xl border border-line bg-panel2/60 px-3 py-2.5 ${active ? 'pulse-turn' : ''} ${!p.connected ? 'opacity-50' : ''}`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? 'bg-sage' : 'bg-cinnabar'}`} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="text-xs text-mist">{p.rackCount} tiles{active ? ' · playing now' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              {active && remaining !== null && (
                <span className={`font-display text-lg font-semibold ${urgent ? 'text-cinnabar' : 'text-mist'}`}>
                  {remaining}s
                </span>
              )}
              <span className="font-display text-2xl font-semibold text-brasslight">{p.score}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LastMove({ move }) {
  if (!move) return null;
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-mist">Last move</h3>
      {move.type === 'play' && (
        <p className="mt-1.5 text-sm leading-relaxed">
          <span className="font-semibold text-ivory">{move.playerName}</span> played{' '}
          {move.words.map((w, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <span className="font-display font-semibold text-brasslight">{w.word}</span>
              <span className="text-mist"> +{w.score}</span>
            </span>
          ))}
          {move.bingo && <span className="text-sage"> · bingo +50</span>}
          <span className="font-semibold text-sage"> = {move.score}</span>
        </p>
      )}
      {move.type === 'pass' && (
        <p className="mt-1.5 text-sm"><span className="font-semibold text-ivory">{move.playerName}</span> passed.</p>
      )}
      {move.type === 'swap' && (
        <p className="mt-1.5 text-sm"><span className="font-semibold text-ivory">{move.playerName}</span> swapped {move.count} tiles.</p>
      )}
    </div>
  );
}

const TIMER_OPTIONS = [
  { seconds: 30, label: '30s' },
  { seconds: 60, label: '1 min' },
  { seconds: 90, label: '90s' },
  { seconds: 120, label: '2 min' },
  { seconds: 180, label: '3 min' },
  { seconds: 0, label: 'No limit' },
];

function TimerPicker({ seconds }) {
  const setTimer = (s) => socket.emit('host:setTimer', { seconds: s });
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-mist">Turn timer</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {TIMER_OPTIONS.map((opt) => (
          <button
            key={opt.seconds}
            onClick={() => setTimer(opt.seconds)}
            className={`btn h-9 px-3.5 text-sm ${seconds === opt.seconds ? 'btn-brass' : 'btn-ghost'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function HostView({ state, onLeave }) {
  const [toast, showToast] = useToast();
  const start = () => socket.emit('host:start', (res) => res?.error && showToast(res.error));
  const restart = () => socket.emit('host:restart', (res) => res?.error && showToast(res.error));

  // ── Lobby ──
  if (state.status === 'lobby') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-5 py-6">
        <Header code={null} onLeave={onLeave} />
        <div className="fade-up flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-mist">Room code</p>
            <div className="mt-4 flex gap-2.5">
              {state.code.split('').map((ch, i) => <CodeTile key={i} ch={ch} />)}
            </div>
            <p className="mt-5 text-sm text-mist">
              Players open <span className="font-semibold text-ivory">{window.location.origin}</span> on their phones and enter the code.
            </p>
          </div>

          <div className="grid w-full max-w-md grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => {
              const p = state.players[i];
              return p ? (
                <div key={p.id} className="pop flex items-center gap-2.5 rounded-xl border border-brass/40 bg-panel px-4 py-3">
                  <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-sage' : 'bg-cinnabar'}`} />
                  <span className="truncate font-semibold text-ivory">{p.name}</span>
                </div>
              ) : (
                <div key={i} className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-mist/60">
                  Waiting…
                </div>
              );
            })}
          </div>

          <TimerPicker seconds={state.turnSeconds} />

          <div className="w-full max-w-md">
            <button onClick={start} disabled={state.players.length < 2} className="btn btn-brass h-12 w-full text-lg">
              Start game
            </button>
            <p className="mt-2 text-xs text-mist">
              {state.players.length < 2 ? 'Needs at least 2 players.' : `${state.players.length} of 4 players in.`}
            </p>
          </div>
        </div>
        <Toast msg={toast} />
      </div>
    );
  }

  const lastCells = new Set((state.lastMove?.cells || []).map((c) => `${c.row},${c.col}`));
  const remaining = useCountdown(state.status === 'playing' ? state.turnEndsAt : null);

  const shadowMap = new Map();
  if (state.preview) {
    const shadowName = state.players[state.preview.playerIdx]?.name;
    for (const c of state.preview.cells)
      shadowMap.set(`${c.row},${c.col}`, { letter: c.isBlank ? (c.letter || '?') : c.letter, isBlank: c.isBlank, playerName: shadowName });
  }

  // ── Playing / ended ──
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-5 px-4 py-5 lg:px-6">
      <Header code={state.code} onLeave={onLeave} />

      {state.status === 'ended' && (
        <div className="fade-up card border-brass/50 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-mist">Game over</p>
          <h2 className="mt-1 font-display text-3xl font-semibold text-brasslight">
            {state.winners?.length > 1 ? `Tie: ${state.winners.join(' & ')}` : `${state.winners?.[0]} wins`}
          </h2>
          <button onClick={restart} className="btn btn-brass mt-4 h-11 px-8">Play again</button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="mx-auto w-full" style={{ maxWidth: 'min(80vh, 100%)' }}>
          <Board board={state.board} lastCells={lastCells} shadow={shadowMap} />
        </div>
        <aside className="space-y-4">
          <PlayerRail state={state} remaining={remaining} />
          <div className="card flex items-center justify-between p-4">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-mist">Tile bag</span>
            <span className="font-display text-2xl font-semibold text-ivory">{state.bagCount}</span>
          </div>
          <LastMove move={state.lastMove} />
        </aside>
      </div>
      <Toast msg={toast} />
    </div>
  );
}
