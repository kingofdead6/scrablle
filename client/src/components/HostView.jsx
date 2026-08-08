import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import Board from './Board';
import Confirm from './Confirm';
import ScoreBurst, { useScoreBurst } from './ScoreBurst';
import ThemeSheet, { ThemeButton } from './ThemePicker';
import ChatPanel, { ChatButton } from './Chat';
import { RefreshButton } from './GameBarButtons';
import { Toast, useToast } from './Toast';
import { useCountdown } from '../useCountdown';

const MAX_BOTS = 3;
const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

function CodeTile({ ch }) {
  return (
    <span className="wordtile h-20 w-[4.5rem] sm:h-24 sm:w-[5.25rem]">
      <span className="font-display text-5xl font-bold sm:text-6xl">{ch}</span>
    </span>
  );
}

function Thinking() {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {[0, 1, 2].map((i) => <span key={i} className="think-dot" style={{ '--i': i }} />)}
    </span>
  );
}

function Header({ code, onLeave, onTheme, onChat, unread, showToast }) {
  return (
    <header className="flex items-center justify-between gap-2">
      <span className="font-display text-lg font-semibold text-ivory">Scrabble Live</span>
      <div className="flex items-center gap-2">
        {code && (
          <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-display text-sm font-semibold tracking-[0.3em] text-brasslight">
            {code}
          </span>
        )}
        <ChatButton unread={unread} onClick={onChat} />
        <RefreshButton onDone={showToast} />
        <ThemeButton onClick={onTheme} className="h-9 px-3 text-sm" />
        <button onClick={onLeave} className="btn btn-ghost h-9 px-3 text-sm">Close room</button>
      </div>
    </header>
  );
}

function PlayerRail({ state, remaining }) {
  const thinkingIdx = state.thinking?.playerIdx;
  return (
    <div className="card space-y-2 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-mist">Players</h3>
      {state.players.map((p, i) => {
        const active = state.status === 'playing' && state.turn === i;
        const urgent = active && remaining !== null && remaining <= 10;
        return (
          <div
            key={p.id}
            className={`flex items-center justify-between rounded-xl border border-line bg-panel2/60 px-3 py-2.5 transition ${active ? 'pulse-turn' : ''} ${!p.connected || p.left ? 'opacity-50' : ''}`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {p.isBot ? (
                <span className="shrink-0 text-sm" aria-hidden="true">🤖</span>
              ) : (
                <span className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? 'bg-sage' : 'bg-cinnabar'}`} />
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="text-xs text-mist">
                  {p.left
                    ? 'left the game'
                    : thinkingIdx === i
                      ? <>thinking <Thinking /></>
                      : `${p.rackCount} tiles${p.isBot ? ` · ${p.difficulty}` : ''}${active ? ' · playing now' : ''}`}
                </p>
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
        <p key={`${move.playerName}-${move.score}`} className="fade-up mt-1.5 text-sm leading-relaxed">
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
      {move.type === 'leave' && (
        <p className="mt-1.5 text-sm"><span className="font-semibold text-ivory">{move.playerName}</span> left the game.</p>
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

function BotControls({ state, showToast }) {
  const [level, setLevel] = useState('medium');
  const bots = state.players.filter((p) => p.isBot);
  const full = state.players.length >= 4 || bots.length >= MAX_BOTS;

  const addBot = () =>
    socket.emit('host:addBot', { difficulty: level }, (res) => res?.error && showToast(res.error));
  const removeBot = (id) =>
    socket.emit('host:removeBot', { id }, (res) => res?.error && showToast(res.error));
  const cycle = (bot) => {
    const next = DIFFICULTIES[(DIFFICULTIES.findIndex((d) => d.id === bot.difficulty) + 1) % DIFFICULTIES.length].id;
    socket.emit('host:setBotDifficulty', { id: bot.id, difficulty: next }, (res) => res?.error && showToast(res.error));
  };

  return (
    <div className="w-full max-w-md">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-mist">Play against bots</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.id}
            onClick={() => setLevel(d.id)}
            className={`btn h-9 px-3.5 text-sm ${level === d.id ? 'btn-brass' : 'btn-ghost'}`}
          >
            {d.label}
          </button>
        ))}
        <button onClick={addBot} disabled={full} className="btn btn-ghost h-9 px-3.5 text-sm">
          + Add bot
        </button>
      </div>
      {bots.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {bots.map((bot) => (
            <span key={bot.id} className="pop flex items-center gap-2 rounded-lg border border-brass/40 bg-brass/10 py-1 pl-2.5 pr-1">
              <span aria-hidden="true">🤖</span>
              <span className="text-sm font-semibold text-ivory">{bot.name}</span>
              <button onClick={() => cycle(bot)} className="rounded px-1.5 text-xs font-semibold uppercase tracking-wide text-brasslight hover:underline">
                {bot.difficulty}
              </button>
              <button onClick={() => removeBot(bot.id)} aria-label={`Remove ${bot.name}`} className="btn btn-ghost h-6 w-6 !rounded-md text-xs">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-mist">
        Up to {MAX_BOTS} bots. Tap a bot's level to change it — at least one human has to sit down.
      </p>
    </div>
  );
}

export default function HostView({ state, onLeave, theme, onTheme, chat }) {
  const [toast, showToastRaw] = useToast();
  const [themeOpen, setThemeOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [burst, showBurst] = useScoreBurst();
  const lastSeen = useRef(null);
  const seeded = useRef(false);

  const showToast = (text, tone) => showToastRaw(text, tone);
  const start = () => socket.emit('host:start', (res) => res?.error && showToast(res.error));
  const restart = () => socket.emit('host:restart', (res) => res?.error && showToast(res.error));

  // The board screen celebrates whoever just scored, players included.
  const move = state.lastMove;
  useEffect(() => {
    const stamp = move?.type === 'play'
      ? `${move.playerName}|${move.score}|${move.words.map((w) => w.word).join(',')}`
      : null;
    // The first state this screen sees is the baseline — a host that reconnects
    // mid-game shouldn't replay a move that already happened.
    if (!seeded.current) {
      seeded.current = true;
      lastSeen.current = stamp;
      return;
    }
    if (stamp === null || stamp === lastSeen.current) return;
    lastSeen.current = stamp;
    if (state.status === 'playing')
      showBurst({ score: move.score, words: move.words, bingo: move.bingo, name: move.playerName });
  }, [move, state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = useCountdown(state.status === 'playing' ? state.turnEndsAt : null);

  const overlays = (
    <>
      {themeOpen && <ThemeSheet theme={theme} onPick={onTheme} onClose={() => setThemeOpen(false)} />}
      {chat.open && (
        <ChatPanel messages={chat.messages} me={null} isHost code={state.code} onClose={chat.close} onError={showToast} />
      )}
      {confirmClose && (
        <Confirm
          title="Close this room?"
          body="Everyone gets sent back to the start screen and the game is gone."
          confirmLabel="Close room"
          onConfirm={() => { setConfirmClose(false); onLeave(); }}
          onCancel={() => setConfirmClose(false)}
        />
      )}
      <Toast msg={toast} />
    </>
  );

  // ── Lobby ──
  if (state.status === 'lobby') {
    const humans = state.players.filter((p) => !p.isBot).length;
    return (
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-5 py-6">
        <Header
          code={null}
          onLeave={() => setConfirmClose(true)}
          onTheme={() => setThemeOpen(true)}
          onChat={chat.toggle}
          unread={chat.unread}
          showToast={showToast}
        />
        <div className="fade-up flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-mist">Room code</p>
            <div className="mt-4 flex gap-2.5">
              {state.code.split('').map((ch, i) => (
                <span key={i} className="deal" style={{ '--i': i }}><CodeTile ch={ch} /></span>
              ))}
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
                  {p.isBot
                    ? <span aria-hidden="true">🤖</span>
                    : <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-sage' : 'bg-cinnabar'}`} />}
                  <span className="truncate font-semibold text-ivory">{p.name}</span>
                </div>
              ) : (
                <div key={i} className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-mist/60">
                  Waiting…
                </div>
              );
            })}
          </div>

          <BotControls state={state} showToast={showToast} />
          <TimerPicker seconds={state.turnSeconds} />

          <div className="w-full max-w-md">
            <button
              onClick={start}
              disabled={state.players.length < 2 || humans === 0}
              className="btn btn-brass h-12 w-full text-lg"
            >
              Start game
            </button>
            <p className="mt-2 text-xs text-mist">
              {state.players.length < 2
                ? 'Needs at least 2 players — bots count.'
                : humans === 0
                  ? 'At least one human has to play.'
                  : `${state.players.length} of 4 players in.`}
            </p>
          </div>
        </div>
        {overlays}
      </div>
    );
  }

  const lastCells = new Set((state.lastMove?.cells || []).map((c) => `${c.row},${c.col}`));

  const shadowMap = new Map();
  if (state.preview) {
    const shadowName = state.players[state.preview.playerIdx]?.name;
    for (const c of state.preview.cells)
      shadowMap.set(`${c.row},${c.col}`, { letter: c.isBlank ? (c.letter || '?') : c.letter, isBlank: c.isBlank, playerName: shadowName });
  }

  // ── Playing / ended ──
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-5 px-4 py-5 lg:px-6">
      <Header
        code={state.code}
        onLeave={() => setConfirmClose(true)}
        onTheme={() => setThemeOpen(true)}
        onChat={chat.toggle}
        unread={chat.unread}
        showToast={showToast}
      />

      {state.status === 'ended' && (
        <div className="fade-up card border-brass/50 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-mist">Game over</p>
          <h2 className="burst-number mt-1 font-display text-3xl font-semibold">
            {state.winners?.length > 1 ? `Tie: ${state.winners.join(' & ')}` : `${state.winners?.[0]} wins`}
          </h2>
          <button onClick={restart} className="btn btn-brass mt-4 h-11 px-8">Play again</button>
        </div>
      )}

      {state.status === 'playing' && state.thinking && (
        <div className="slide-down flex items-center justify-center gap-2 rounded-xl border border-brass/35 bg-brass/10 px-4 py-2 text-sm text-brasslight">
          <span aria-hidden="true">🤖</span>
          <span className="font-semibold">{state.thinking.name}</span> is thinking <Thinking />
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
      <ScoreBurst burst={burst} label={burst?.name ? `${burst.name} scored` : 'Scored'} />
      {overlays}
    </div>
  );
}
